"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CallOutcome, ContactChannel, EmailDirection } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Log of phone / SMS / LinkedIn outreach for a candidate. Each entry has:
 *
 *  - channel:   CALL | SMS | LINKEDIN — picked by which button you click.
 *  - direction: INBOUND  ("Rec ...")  or  OUTBOUND ("Log ..."). Reuses
 *               EmailDirection so the UI badge can match the email tab.
 *  - outcome:   only set when channel=CALL (either direction) — a single
 *               disposition field shared by outbound ("Log Call") and
 *               inbound ("Rec Call"); the UI offers the subset of values
 *               appropriate to the direction.
 *  - notes:     optional free-form text. The textarea is shared across all
 *               six buttons; whatever's there at click time is attached.
 *
 * Mirrors the email-history pattern so the candidate page can render both
 * in the same INBOUND/OUTBOUND idiom.
 */

const logSchema = z
  .object({
    notes: z
      .string()
      .trim()
      .max(4000)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    direction: z.nativeEnum(EmailDirection),
    channel: z.nativeEnum(ContactChannel),
    outcome: z.nativeEnum(CallOutcome).optional(),
  })
  .refine(
    // Outcomes only apply to calls (inbound or outbound); reject obviously
    // -wrong combos (e.g. SMS + Left Voicemail) so they don't quietly
    // become bad rows.
    (v) => !v.outcome || v.channel === ContactChannel.CALL,
    { path: ["outcome"], message: "Outcome only applies to calls." },
  );

export type LogContactResult = { ok: true; id: string } | { ok: false; error: string };

export async function logContact(
  candidateId: string,
  _prev: LogContactResult | undefined,
  formData: FormData,
): Promise<LogContactResult> {
  const { session, orgId } = await requireSessionWithOrg();

  // FormData.get() returns null when the field is absent, but the schema's
  // optional string fields only accept `string | undefined` — pass through
  // a null-to-undefined for each so an unset note doesn't fail validation
  // ("Expected string, received null"). This was the cause of the "Invalid
  // input" error every time someone clicked a button without typing a note.
  const parsed = logSchema.safeParse({
    notes: formData.get("notes") ?? undefined,
    direction: formData.get("direction") ?? undefined,
    channel: formData.get("channel") ?? undefined,
    outcome: formData.get("outcome") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Tenant-scoped lookup so a stray candidate id from another org can't be
  // logged against. Returns the candidate's id only — we don't need the rest.
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!candidate) {
    return { ok: false, error: "Candidate not found." };
  }
  if (!session.user.id) {
    return { ok: false, error: "Sign in to log a contact." };
  }

  const created = await prisma.contactLog.create({
    data: {
      candidateId: candidate.id,
      organizationId: orgId,
      loggedByUserId: session.user.id,
      direction: parsed.data.direction,
      channel: parsed.data.channel,
      outcome: parsed.data.outcome ?? null,
      notes: parsed.data.notes,
    },
    select: { id: true },
  });

  // Mirror EmailLog behaviour — bump the candidate's lastContactedAt so
  // the candidate list's "last contact" column reflects this touchpoint.
  if (parsed.data.direction === EmailDirection.OUTBOUND) {
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { lastContactedAt: new Date() },
    });
  }

  revalidatePath(`/candidates/${candidate.id}`);
  return { ok: true, id: created.id };
}

/**
 * Edit the notes on an existing ContactLog row. Channel / direction /
 * outcome / timestamp are intentionally NOT editable — those represent
 * facts about a touchpoint that already happened. If the user clicked
 * the wrong button they can delete and re-log.
 */

const editSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type EditContactResult = { ok: true } | { ok: false; error: string };

export async function updateContactLog(
  logId: string,
  notes: string,
): Promise<EditContactResult> {
  const { orgId } = await requireSessionWithOrg();

  const parsed = editSchema.safeParse({ notes });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Tenant-scope the update so a stray id from another org can't be touched.
  const existing = await prisma.contactLog.findFirst({
    where: { id: logId, organizationId: orgId },
    select: { id: true, candidateId: true },
  });
  if (!existing) {
    return { ok: false, error: "Entry not found." };
  }

  await prisma.contactLog.update({
    where: { id: existing.id },
    data: { notes: parsed.data.notes },
  });

  revalidatePath(`/candidates/${existing.candidateId}`);
  return { ok: true };
}

/**
 * Delete a ContactLog row — the escape hatch for "clicked the wrong
 * button" that the edit action's docs promise (channel / direction /
 * outcome aren't editable; you delete and re-log instead).
 */
export async function deleteContactLog(logId: string): Promise<EditContactResult> {
  const { orgId } = await requireSessionWithOrg();

  // Tenant-scope the delete so a stray id from another org can't be touched.
  const existing = await prisma.contactLog.findFirst({
    where: { id: logId, organizationId: orgId },
    select: { id: true, candidateId: true },
  });
  if (!existing) {
    return { ok: false, error: "Entry not found." };
  }

  await prisma.contactLog.delete({ where: { id: existing.id } });

  revalidatePath(`/candidates/${existing.candidateId}`);
  return { ok: true };
}
