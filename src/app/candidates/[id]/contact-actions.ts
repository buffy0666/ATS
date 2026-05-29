"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EmailDirection } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Free-form log of a phone call / SMS / LinkedIn message for a candidate.
 * The recruiter types what happened ("Left voicemail, mentioned Director
 * role"), then hits the Sent or Received button to stamp it with their
 * id, time, and direction.
 *
 * Mirrors the email-history pattern so the candidate page can render both
 * in the same INBOUND/OUTBOUND idiom.
 */

const schema = z.object({
  notes: z.string().trim().min(1, "Add a note before logging.").max(4000),
  direction: z.nativeEnum(EmailDirection),
});

export type LogContactResult = { ok: true; id: string } | { ok: false; error: string };

export async function logContact(
  candidateId: string,
  _prev: LogContactResult | undefined,
  formData: FormData,
): Promise<LogContactResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const parsed = schema.safeParse({
    notes: formData.get("notes"),
    direction: formData.get("direction"),
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
