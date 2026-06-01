"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, CustomFieldEntity, Prisma } from "@/generated/prisma";
import { auditDelete, auditEvent } from "@/lib/audit/write";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EMAIL_FIELD_KEY, MERGE_FIELDS, type FieldWinner } from "./fields";

export type MergeResult =
  | { ok: true; primaryId: string }
  | { ok: false; error: string };

export type MergeInput = {
  primaryId: string;
  secondaryId: string;
  /** Winner per scalar/array/json profile field (see MERGE_FIELDS). */
  fieldChoices: Record<string, FieldWinner>;
  /**
   * Winner per CONFLICTING job — i.e. a job both candidates have an
   * application to. Keyed by jobId. "primary" keeps the primary candidate's
   * application (and its stage); "secondary" keeps the other one. The
   * loser's notes/emails/interviews/enrollments are re-pointed onto the
   * survivor before it is deleted. The UI forces an explicit choice here
   * rather than guessing — losing a further-along stage is destructive.
   */
  applicationChoices: Record<string, FieldWinner>;
};

function candidateLabel(c: { firstName: string; lastName: string; email: string }): string {
  const name = `${c.firstName} ${c.lastName}`.trim();
  return name || c.email;
}

/** Concatenate two legacy free-text notes blobs rather than picking one. */
function concatNotes(a: string | null, b: string | null): string | null {
  const parts = [a, b].map((s) => (s ?? "").trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join("\n\n---\n\n");
}

/** Most-recent of two nullable timestamps. */
function mostRecent(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/**
 * Soonest UPCOMING follow-up: the earliest of the two dates that is still in
 * the future. If neither is upcoming, keep the latest of the two so a
 * follow-up is never silently dropped.
 */
function soonestUpcoming(a: Date | null, b: Date | null, nowMs: number): Date | null {
  const dates = [a, b].filter((d): d is Date => d != null);
  if (dates.length === 0) return null;
  const future = dates.filter((d) => d.getTime() >= nowMs);
  if (future.length > 0) return future.reduce((m, d) => (d.getTime() < m.getTime() ? d : m));
  return dates.reduce((m, d) => (d.getTime() > m.getTime() ? d : m));
}

const SECONDARY_INCLUDE = {
  applications: { select: { id: true, jobId: true, stage: true } },
  tags: { select: { id: true } },
  eeo: { select: { id: true } },
  enrollments: { select: { id: true, sequenceId: true } },
  listMemberships: { select: { id: true, listId: true } },
  _count: {
    select: {
      applications: true,
      emails: true,
      contactLogs: true,
      interviews: true,
      enrollments: true,
      listMemberships: true,
      documents: true,
      references: true,
      activities: true,
      noteThreads: true,
      tags: true,
    },
  },
} satisfies Prisma.CandidateInclude;

/**
 * Merge two duplicate candidate records into one. The PRIMARY survives; the
 * SECONDARY is deleted after every relation is re-pointed/de-duped onto the
 * primary and the chosen scalar fields are applied.
 *
 * Multi-tenant: both ids are re-verified against the caller's org; nothing
 * touches data outside it. Destructive → ADMIN/OWNER only. The whole
 * mutation runs in a single transaction so any failure leaves both records
 * fully intact.
 */
export async function mergeCandidates(input: MergeInput): Promise<MergeResult> {
  const { session, orgId } = await requireAdminWithOrg();
  const { primaryId, secondaryId, fieldChoices, applicationChoices } = input;

  if (!primaryId || !secondaryId || primaryId === secondaryId) {
    return { ok: false, error: "Pick two different candidates to merge." };
  }

  // Re-verify BOTH ids belong to this org — never trust ids from the client.
  const owned = await prisma.candidate.findMany({
    where: { id: { in: [primaryId, secondaryId] }, organizationId: orgId },
    select: { id: true },
  });
  if (owned.length !== 2) {
    return { ok: false, error: "One or both candidates were not found in your workspace." };
  }

  const [primary, secondary] = await Promise.all([
    prisma.candidate.findFirst({ where: { id: primaryId, organizationId: orgId }, include: SECONDARY_INCLUDE }),
    prisma.candidate.findFirst({ where: { id: secondaryId, organizationId: orgId }, include: SECONDARY_INCLUDE }),
  ]);
  if (!primary || !secondary) {
    return { ok: false, error: "One or both candidates were not found in your workspace." };
  }

  // Application overlap: any job both candidates have an application to needs
  // an explicit winner. Refuse to guess.
  const primaryAppByJob = new Map(primary.applications.map((a) => [a.jobId, a]));
  const conflictingJobIds = secondary.applications
    .filter((a) => primaryAppByJob.has(a.jobId))
    .map((a) => a.jobId);
  for (const jobId of conflictingJobIds) {
    const choice = applicationChoices[jobId];
    if (choice !== "primary" && choice !== "secondary") {
      return {
        ok: false,
        error: "Both candidates applied to the same job — choose which application to keep before merging.",
      };
    }
  }

  const nowMs = Date.now();
  const secondaryEmail = secondary.email;
  const emailWinner: FieldWinner = fieldChoices[EMAIL_FIELD_KEY] === "secondary" ? "secondary" : "primary";

  const counts = {
    notes: secondary._count.noteThreads,
    emails: secondary._count.emails,
    contactLogs: secondary._count.contactLogs,
    applications: secondary._count.applications,
    interviews: secondary._count.interviews,
    enrollments: secondary._count.enrollments,
    listMemberships: secondary._count.listMemberships,
    documents: secondary._count.documents,
    references: secondary._count.references,
    activities: secondary._count.activities,
    tags: secondary._count.tags,
  };
  const mergedFromLabel = candidateLabel(secondary);

  try {
    await prisma.$transaction(async (tx) => {
      // (A) Tags → union onto primary. connect is idempotent for tags the
      // primary already carries.
      if (secondary.tags.length > 0) {
        await tx.candidate.update({
          where: { id: primaryId },
          data: { tags: { connect: secondary.tags.map((t) => ({ id: t.id })) } },
        });
      }

      // (B) Applications → re-point or de-dupe on @@unique([jobId, candidateId]).
      for (const secApp of secondary.applications) {
        const primApp = primaryAppByJob.get(secApp.jobId);
        if (!primApp) {
          // No conflict — primary isn't on this job yet. Re-point the app.
          await tx.application.update({
            where: { id: secApp.id },
            data: { candidateId: primaryId },
          });
          continue;
        }
        // Conflict — user chose which application survives.
        const winner = applicationChoices[secApp.jobId] === "secondary" ? secApp : primApp;
        const loser = winner.id === secApp.id ? primApp : secApp;
        // Move the loser application's children onto the survivor so nothing
        // is lost when it's deleted (Note cascades; the rest SetNull).
        await tx.note.updateMany({ where: { applicationId: loser.id }, data: { applicationId: winner.id } });
        await tx.emailLog.updateMany({ where: { applicationId: loser.id }, data: { applicationId: winner.id } });
        await tx.interview.updateMany({ where: { applicationId: loser.id }, data: { applicationId: winner.id } });
        await tx.sequenceEnrollment.updateMany({ where: { applicationId: loser.id }, data: { applicationId: winner.id } });
        await tx.application.delete({ where: { id: loser.id } });
        // If the secondary's app survived, re-point it to the primary. Safe
        // now: the primary's app for this job (the loser) is already gone, so
        // the (jobId, candidateId) unique won't collide.
        if (winner.id === secApp.id) {
          await tx.application.update({ where: { id: secApp.id }, data: { candidateId: primaryId } });
        }
      }

      // (C) Wholesale candidate-level relation re-points (no unique constraint
      // on these — merge everything).
      await tx.note.updateMany({ where: { candidateId: secondaryId }, data: { candidateId: primaryId } });
      await tx.emailLog.updateMany({ where: { candidateId: secondaryId }, data: { candidateId: primaryId } });
      await tx.contactLog.updateMany({ where: { candidateId: secondaryId }, data: { candidateId: primaryId } });
      await tx.interview.updateMany({ where: { candidateId: secondaryId }, data: { candidateId: primaryId } });
      await tx.candidateDocument.updateMany({ where: { candidateId: secondaryId }, data: { candidateId: primaryId } });
      await tx.candidateReference.updateMany({ where: { candidateId: secondaryId }, data: { candidateId: primaryId } });
      await tx.candidateActivity.updateMany({ where: { candidateId: secondaryId }, data: { candidateId: primaryId } });

      // (D) Sequence enrollments → de-dupe on @@unique([sequenceId, candidateId]).
      const primarySeqIds = new Set(primary.enrollments.map((e) => e.sequenceId));
      for (const enr of secondary.enrollments) {
        if (primarySeqIds.has(enr.sequenceId)) {
          // Primary already enrolled in this sequence — drop the duplicate
          // (its StepRuns cascade).
          await tx.sequenceEnrollment.delete({ where: { id: enr.id } });
        } else {
          await tx.sequenceEnrollment.update({ where: { id: enr.id }, data: { candidateId: primaryId } });
          primarySeqIds.add(enr.sequenceId);
        }
      }

      // (E) List memberships → de-dupe on @@unique([listId, candidateId]).
      const primaryListIds = new Set(primary.listMemberships.map((m) => m.listId));
      for (const m of secondary.listMemberships) {
        if (primaryListIds.has(m.listId)) {
          await tx.candidateListMember.delete({ where: { id: m.id } });
        } else {
          await tx.candidateListMember.update({ where: { id: m.id }, data: { candidateId: primaryId } });
          primaryListIds.add(m.listId);
        }
      }

      // (F) EEO (1:1, legally gated) — keep primary's if present; otherwise
      // re-point secondary's. Never field-merge silently.
      if (!primary.eeo && secondary.eeo) {
        await tx.candidateEEO.update({ where: { id: secondary.eeo.id }, data: { candidateId: primaryId } });
      }
      // If both exist, the secondary's row cascades away when it's deleted.

      // (G) Custom field values — move secondary's onto primary for fields the
      // primary has no value for; conflicts keep the primary's. Then clean up
      // any leftovers (mirrors delete-action's custom-field cleanup).
      const [primCFV, secCFV] = await Promise.all([
        tx.customFieldValue.findMany({
          where: { entityId: primaryId, field: { entity: CustomFieldEntity.CANDIDATE, organizationId: orgId } },
          select: { fieldId: true },
        }),
        tx.customFieldValue.findMany({
          where: { entityId: secondaryId, field: { entity: CustomFieldEntity.CANDIDATE, organizationId: orgId } },
          select: { id: true, fieldId: true },
        }),
      ]);
      const primaryFieldIds = new Set(primCFV.map((v) => v.fieldId));
      for (const v of secCFV) {
        if (!primaryFieldIds.has(v.fieldId)) {
          await tx.customFieldValue.update({ where: { id: v.id }, data: { entityId: primaryId } });
          primaryFieldIds.add(v.fieldId);
        }
      }
      await tx.customFieldValue.deleteMany({
        where: { entityId: secondaryId, field: { entity: CustomFieldEntity.CANDIDATE, organizationId: orgId } },
      });

      // (H) Apply scalar/array/json field choices to the primary (NOT email —
      // that's set after the secondary is deleted to dodge the unique
      // constraint). Plus the always-on rules: notes concatenate,
      // lastContactedAt = most recent, nextFollowUpAt = soonest upcoming.
      const data: Record<string, unknown> = {};
      for (const f of MERGE_FIELDS) {
        if (f.key === EMAIL_FIELD_KEY) continue;
        if (fieldChoices[f.key] === "secondary") {
          const value = (secondary as Record<string, unknown>)[f.key];
          // A nullable Json column (workHistory / education) can't take a raw
          // JS null in an update — Prisma requires the sentinel.
          data[f.key] = f.kind === "json" && value === null ? Prisma.DbNull : value;
        }
      }
      data.notes = concatNotes(primary.notes, secondary.notes);
      data.lastContactedAt = mostRecent(primary.lastContactedAt, secondary.lastContactedAt);
      data.nextFollowUpAt = soonestUpcoming(primary.nextFollowUpAt, secondary.nextFollowUpAt, nowMs);
      await tx.candidate.update({
        where: { id: primaryId },
        data: data as Prisma.CandidateUpdateInput,
      });

      // (I) Record the merge on the surviving candidate's activity timeline.
      await tx.candidateActivity.create({
        data: {
          candidateId: primaryId,
          type: "MERGED",
          description: `Merged in duplicate record "${mergedFromLabel}" (${secondaryEmail}).`,
          userId: session.user.id ?? null,
          metadata: { mergedFromId: secondaryId, mergedFromLabel, counts } as Prisma.InputJsonValue,
        },
      });

      // (J) Delete the secondary — org-scoped, mirroring delete-action. Every
      // FK that pointed at it has been re-pointed; remaining 1:1/m:n rows
      // (a kept-primary EEO's secondary twin, tag joins) cascade away.
      await tx.candidate.deleteMany({ where: { id: secondaryId, organizationId: orgId } });

      // (K) Finally, set the primary's email if the secondary's won — only now
      // is it free of the @@unique([organizationId, email]) collision.
      if (emailWinner === "secondary" && secondaryEmail !== primary.email) {
        await tx.candidate.update({ where: { id: primaryId }, data: { email: secondaryEmail } });
      }
    }, {
      // A merge fans out into many sequential writes (one per relation, plus
      // per-application/enrollment/list de-dupe). Bump past Prisma's 5s
      // default so a candidate with a lot of history doesn't time out.
      timeout: 20_000,
    });
  } catch (err) {
    console.error("[mergeCandidates] transaction failed", err);
    return { ok: false, error: "The merge failed and nothing was changed. Please try again." };
  }

  // Audit AFTER the transaction commits (audit writes use the global client +
  // request context and never throw). Two rows: the merge itself on the
  // primary, and the secondary's deletion so its disappearance is explained.
  const { applications, tags, eeo, enrollments, listMemberships, _count, ...secondaryScalars } = secondary;
  void applications;
  void tags;
  void eeo;
  void enrollments;
  void listMemberships;
  void _count;
  await auditDelete("Candidate", secondaryScalars as unknown as Record<string, unknown>);
  await auditEvent({
    action: AuditAction.CANDIDATE_MERGE,
    entityType: "Candidate",
    entityId: primaryId,
    entityLabel: candidateLabel(primary),
    metadata: {
      mergedFromId: secondaryId,
      mergedFromLabel,
      fieldChoices,
      applicationChoices,
      counts,
    },
  });

  revalidatePath("/candidates");
  revalidatePath(`/candidates/${primaryId}`);
  return { ok: true, primaryId };
}
