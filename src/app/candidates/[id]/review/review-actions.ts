"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CandidateStatus, Stage } from "@/generated/prisma";

export async function setCandidateRating(candidateId: string, rating: number | null) {
  await requireSession();
  if (rating !== null && (rating < 1 || rating > 5)) {
    throw new Error("Rating must be between 1 and 5.");
  }
  await prisma.candidate.update({ where: { id: candidateId }, data: { rating } });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/candidates/${candidateId}/review`);
}

export async function setCandidateStatus(candidateId: string, status: CandidateStatus) {
  await requireSession();
  await prisma.candidate.update({ where: { id: candidateId }, data: { status } });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/candidates/${candidateId}/review`);
}

export async function setNextFollowUp(candidateId: string, dateIso: string | null) {
  await requireSession();
  const date = dateIso ? new Date(dateIso) : null;
  if (date && Number.isNaN(date.getTime())) {
    throw new Error("Invalid date.");
  }
  await prisma.candidate.update({
    where: { id: candidateId },
    data: { nextFollowUpAt: date },
  });
  revalidatePath(`/candidates/${candidateId}/review`);
}

export async function markContactedNow(candidateId: string) {
  await requireSession();
  await prisma.candidate.update({
    where: { id: candidateId },
    data: { lastContactedAt: new Date() },
  });
  revalidatePath(`/candidates/${candidateId}/review`);
}

export async function setApplicationStage(applicationId: string, stage: Stage) {
  await requireSession();
  const app = await prisma.application.update({
    where: { id: applicationId },
    data: { stage },
    select: { candidateId: true, jobId: true },
  });
  revalidatePath(`/candidates/${app.candidateId}/review`);
  revalidatePath(`/jobs/${app.jobId}`);
}

const quickNoteSchema = z.object({
  applicationId: z.string().min(1),
  body: z.string().min(1).max(10000),
});

export type QuickNoteResult = { ok: true } | { ok: false; error: string };

export async function addQuickNote(
  candidateId: string,
  _prev: QuickNoteResult | undefined,
  formData: FormData,
): Promise<QuickNoteResult> {
  const session = await requireSession();
  const parsed = quickNoteSchema.safeParse({
    applicationId: formData.get("applicationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const app = await prisma.application.findFirst({
    where: { id: parsed.data.applicationId, candidateId },
    select: { id: true },
  });
  if (!app) return { ok: false, error: "That application doesn't belong to this candidate." };

  await prisma.note.create({
    data: {
      applicationId: app.id,
      authorId: session.user.id,
      body: parsed.data.body,
    },
  });
  revalidatePath(`/candidates/${candidateId}/review`);
  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}
