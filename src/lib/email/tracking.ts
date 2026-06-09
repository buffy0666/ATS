import "server-only";

import { prisma } from "@/lib/prisma";
import { cancelScheduledEmail, EmailProviderError } from "@/lib/email";
import {
  EmailDirection,
  EmailSource,
  EnrollmentStatus,
  StepRunStatus,
} from "@/generated/prisma";

/**
 * Email engagement tracking + sequence auto-stop.
 *
 * The Resend webhook (POST /api/webhooks/resend) parses + verifies events and
 * calls into here. Kept separate from the route so the matching/auto-stop
 * logic is testable and reusable (e.g. a future inbound-mailbox path can call
 * recordReply directly).
 *
 * Matching: outbound emails are stored in EmailLog with
 * providerMessageId = Resend's message id. Engagement events carry that id, so
 * we look the row up by it. Inbound replies don't reference our id directly;
 * see recordReplyByRecipient.
 */

type EngagementKind = "opened" | "clicked" | "bounced" | "complained";

const FIELD_BY_KIND: Record<EngagementKind, "openedAt" | "firstClickedAt" | "bouncedAt" | "complainedAt"> = {
  opened: "openedAt",
  clicked: "firstClickedAt",
  bounced: "bouncedAt",
  complained: "complainedAt",
};

/**
 * Stamp an engagement event onto the matching EmailLog row (by Resend id).
 * Idempotent: only writes the first occurrence (so re-delivered webhooks and
 * repeat opens/clicks don't churn the timestamp). Bounce/complaint also
 * auto-stop the candidate's active sequence enrollment.
 */
export async function recordEngagement(
  providerMessageId: string,
  kind: EngagementKind,
  at: Date,
): Promise<void> {
  if (!providerMessageId) return;

  const log = await prisma.emailLog.findFirst({
    where: { providerMessageId },
    select: {
      id: true,
      candidateId: true,
      organizationId: true,
      openedAt: true,
      firstClickedAt: true,
      bouncedAt: true,
      complainedAt: true,
    },
  });
  if (!log) return; // unknown message — ignore (could be a non-ATS send)

  const field = FIELD_BY_KIND[kind];
  // Only stamp the first occurrence.
  if (log[field]) return;

  await prisma.emailLog.update({
    where: { id: log.id },
    data: { [field]: at },
  });

  // Hard signals → stop the sequence so we don't keep emailing a dead/angry
  // address.
  if ((kind === "bounced" || kind === "complained") && log.candidateId) {
    await autoStopEnrollments(
      log.candidateId,
      log.organizationId,
      kind === "bounced" ? "Email bounced" : "Marked as spam",
    );
  }
}

/**
 * Record an inbound reply from a candidate and auto-stop their sequence.
 * Resend Inbound delivers the parsed reply; we match the sender to a
 * candidate by email within the org (inbound has no providerMessageId of
 * ours). Creates an INBOUND EmailLog row for the timeline and pauses the
 * active enrollment.
 */
export async function recordReply(input: {
  fromEmail: string;
  organizationId: string | null;
  subject: string;
  text?: string | null;
  html?: string | null;
  messageId?: string | null;
  receivedAt: Date;
}): Promise<{ matched: boolean }> {
  const fromEmail = input.fromEmail.trim().toLowerCase();
  if (!fromEmail) return { matched: false };

  // Dedupe: if we already ingested this RFC Message-ID, skip.
  if (input.messageId) {
    const existing = await prisma.emailLog.findFirst({
      where: { messageId: input.messageId },
      select: { id: true },
    });
    if (existing) return { matched: true };
  }

  const candidate = await prisma.candidate.findFirst({
    where: {
      email: { equals: fromEmail, mode: "insensitive" },
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    },
    select: { id: true, organizationId: true },
  });
  if (!candidate) return { matched: false };

  // The "owning" recruiter: whoever last emailed this candidate (so the
  // inbound row attaches to a real user, matching the EmailLog.fromUserId
  // contract for INBOUND).
  const lastOutbound = await prisma.emailLog.findFirst({
    where: { candidateId: candidate.id, direction: EmailDirection.OUTBOUND },
    orderBy: { sentAt: "desc" },
    select: { fromUserId: true },
  });

  if (lastOutbound) {
    await prisma.emailLog.create({
      data: {
        candidateId: candidate.id,
        organizationId: candidate.organizationId,
        fromUserId: lastOutbound.fromUserId,
        fromEmail,
        to: "", // inbound: addressed to our app; recruiter is fromUserId
        subject: input.subject || "(no subject)",
        bodyText: input.text ?? null,
        bodyHtml: input.html ?? null,
        direction: EmailDirection.INBOUND,
        source: EmailSource.WEBHOOK,
        messageId: input.messageId ?? null,
        provider: "resend-inbound",
        status: "SENT",
        sentAt: input.receivedAt,
      },
    });

    // Stamp repliedAt on the most recent outbound to this candidate.
    const lastSent = await prisma.emailLog.findFirst({
      where: {
        candidateId: candidate.id,
        direction: EmailDirection.OUTBOUND,
        repliedAt: null,
      },
      orderBy: { sentAt: "desc" },
      select: { id: true },
    });
    if (lastSent) {
      await prisma.emailLog.update({
        where: { id: lastSent.id },
        data: { repliedAt: input.receivedAt },
      });
    }
  }

  await autoStopEnrollments(candidate.id, candidate.organizationId, "Candidate replied");
  return { matched: true };
}

/**
 * Pause every ACTIVE enrollment for a candidate and cancel its pending
 * scheduled emails. Mirrors the manual pause path in sequences/actions.ts but
 * runs without a user session (it's webhook-driven).
 */
async function autoStopEnrollments(
  candidateId: string,
  organizationId: string | null,
  reason: string,
): Promise<void> {
  const active = await prisma.sequenceEnrollment.findMany({
    where: {
      candidateId,
      status: EnrollmentStatus.ACTIVE,
      ...(organizationId ? { sequence: { organizationId } } : {}),
    },
    select: { id: true },
  });
  if (active.length === 0) return;

  for (const e of active) {
    // Cancel pending scheduled emails for this enrollment.
    const pending = await prisma.stepRun.findMany({
      where: {
        enrollmentId: e.id,
        status: StepRunStatus.PENDING,
        resendScheduledId: { not: null },
      },
      select: { id: true, resendScheduledId: true },
    });
    for (const run of pending) {
      if (run.resendScheduledId) {
        try {
          await cancelScheduledEmail(run.resendScheduledId);
        } catch (err) {
          if (err instanceof EmailProviderError) {
            console.warn(`auto-stop: cancel failed for ${run.resendScheduledId}:`, err.message);
          } else {
            console.warn("auto-stop: cancel error:", err);
          }
        }
      }
      await prisma.stepRun.update({
        where: { id: run.id },
        data: { status: StepRunStatus.SKIPPED, resendScheduledId: null },
      });
    }

    await prisma.sequenceEnrollment.update({
      where: { id: e.id },
      data: {
        status: EnrollmentStatus.PAUSED,
        pausedAt: new Date(),
        autoStopReason: reason,
      },
    });
  }
}
