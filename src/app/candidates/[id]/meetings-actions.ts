"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InterviewStatus, InterviewType } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export type LogMeetingResult = { ok: true; meetingId: string } | { ok: false; error: string };

/**
 * Quick "Log" entry from the Meetings tab — records a meeting that
 * already happened. Backed by the Interview model with status=COMPLETED
 * so logged meetings sit alongside scheduled ones in chronological order
 * and benefit from the existing interview detail page.
 */
const schema = z.object({
  title: z.string().trim().min(1).max(200),
  occurredAt: z
    .string()
    .trim()
    .min(1)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid date"),
  durationMinutes: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(0).max(1440))
    .default(30),
  type: z.nativeEnum(InterviewType).default(InterviewType.OTHER),
  notes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

export async function logMeeting(
  candidateId: string,
  formData: FormData,
): Promise<LogMeetingResult> {
  const { session, orgId } = await requireSessionWithOrg();
  const userId = session.user.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  // Confirm the candidate is in this org (defense in depth — the candidate
  // page already loads with org scoping, but a forged cuid here shouldn't
  // be able to land an Interview row on a candidate from another tenant).
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!candidate) return { ok: false, error: "Candidate not found in your workspace." };

  const parsed = schema.safeParse({
    title: formData.get("title"),
    occurredAt: formData.get("occurredAt"),
    durationMinutes: formData.get("durationMinutes"),
    type: formData.get("type"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { title, occurredAt, durationMinutes, type, notes } = parsed.data;
  const startAt = new Date(occurredAt);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

  const meeting = await prisma.interview.create({
    data: {
      candidateId,
      title,
      type,
      status: InterviewStatus.COMPLETED,
      startAt,
      endAt,
      description: notes,
      organizerId: userId,
      organizationId: orgId,
    },
    select: { id: true },
  });

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, meetingId: meeting.id };
}
