"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CandidateStatus, Stage } from "@/generated/prisma";

/**
 * All review actions take a candidateId / applicationId and write directly
 * to that row. To prevent cross-tenant writes via a guessed id, every
 * action uses updateMany (or findFirst+update) with an organizationId
 * filter, so the write is a no-op when the row belongs to another org.
 */

export async function setCandidateRating(candidateId: string, rating: number | null) {
  const { orgId } = await requireSessionWithOrg();
  if (rating !== null && (rating < 1 || rating > 5)) {
    throw new Error("Rating must be between 1 and 5.");
  }
  await prisma.candidate.updateMany({
    where: { id: candidateId, organizationId: orgId },
    data: { rating },
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/candidates/${candidateId}/review`);
}

export async function setCandidateStatus(candidateId: string, status: CandidateStatus) {
  const { orgId } = await requireSessionWithOrg();
  await prisma.candidate.updateMany({
    where: { id: candidateId, organizationId: orgId },
    data: { status },
  });
  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/candidates/${candidateId}/review`);
}

export async function setNextFollowUp(candidateId: string, dateIso: string | null) {
  const { orgId } = await requireSessionWithOrg();
  const date = dateIso ? new Date(dateIso) : null;
  if (date && Number.isNaN(date.getTime())) {
    throw new Error("Invalid date.");
  }
  await prisma.candidate.updateMany({
    where: { id: candidateId, organizationId: orgId },
    data: { nextFollowUpAt: date },
  });
  revalidatePath(`/candidates/${candidateId}/review`);
}

export async function markContactedNow(candidateId: string) {
  const { orgId } = await requireSessionWithOrg();
  await prisma.candidate.updateMany({
    where: { id: candidateId, organizationId: orgId },
    data: { lastContactedAt: new Date() },
  });
  revalidatePath(`/candidates/${candidateId}/review`);
}

export async function setApplicationStage(applicationId: string, stage: Stage) {
  const { orgId } = await requireSessionWithOrg();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: orgId },
    select: { id: true, candidateId: true, jobId: true },
  });
  if (!app) throw new Error("Application not found.");
  await prisma.application.update({
    where: { id: app.id },
    data: { stage },
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
  const { session, orgId } = await requireSessionWithOrg();
  const parsed = quickNoteSchema.safeParse({
    applicationId: formData.get("applicationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const app = await prisma.application.findFirst({
    where: { id: parsed.data.applicationId, candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!app) return { ok: false, error: "That application doesn't belong to this candidate." };

  await prisma.note.create({
    data: {
      applicationId: app.id,
      authorId: session.user.id,
      body: parsed.data.body,
      organizationId: orgId,
    },
  });
  revalidatePath(`/candidates/${candidateId}/review`);
  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}
