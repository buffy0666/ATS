"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Stage } from "@/generated/prisma";

/**
 * Server actions backing the Jobs section on the candidate detail page.
 *
 * All three actions revalidate the candidate detail path AND the job detail
 * path so a pipeline view of the affected job stays in sync.
 */

export type JobActionResult = { ok: true } | { ok: false; error: string };

/**
 * Add this candidate to a job. Idempotent — if an Application already
 * exists for this (job, candidate) pair, the stage is left untouched.
 */
export async function addCandidateToJob(
  candidateId: string,
  jobId: string,
): Promise<JobActionResult> {
  await requireSession();

  const parsed = z.string().min(1).safeParse(jobId);
  if (!parsed.success) return { ok: false, error: "Invalid job id." };

  // Verify both records exist before writing — clearer error than a FK violation.
  const [candidate, job] = await Promise.all([
    prisma.candidate.findUnique({ where: { id: candidateId }, select: { id: true } }),
    prisma.job.findUnique({ where: { id: jobId }, select: { id: true } }),
  ]);
  if (!candidate) return { ok: false, error: "Candidate not found." };
  if (!job) return { ok: false, error: "Job not found." };

  await prisma.application.upsert({
    where: { jobId_candidateId: { jobId, candidateId } },
    update: {},
    create: { jobId, candidateId, stage: Stage.APPLIED },
  });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/**
 * Change the pipeline stage of a candidate on a specific job. Verifies that
 * the application belongs to the named candidate (defense-in-depth — the
 * client component sends both ids so we can confirm cross-write safety).
 */
export async function updateApplicationStage(
  applicationId: string,
  candidateId: string,
  newStage: Stage,
): Promise<JobActionResult> {
  await requireSession();

  if (!Object.values(Stage).includes(newStage)) {
    return { ok: false, error: "Unknown stage." };
  }

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, candidateId: true, jobId: true, stage: true },
  });
  if (!app) return { ok: false, error: "Application not found." };
  if (app.candidateId !== candidateId) {
    return { ok: false, error: "Application doesn't belong to this candidate." };
  }
  if (app.stage === newStage) {
    return { ok: true };
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: { stage: newStage },
  });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/jobs/${app.jobId}`);
  return { ok: true };
}

/**
 * Remove a candidate from a job. Hard-deletes the Application row plus its
 * dependent notes (cascading), so use with intent — there's no soft-delete
 * here. Calling code should `confirm()` first.
 */
export async function removeCandidateFromJob(
  applicationId: string,
  candidateId: string,
): Promise<JobActionResult> {
  await requireSession();

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, candidateId: true, jobId: true },
  });
  if (!app) return { ok: false, error: "Application not found." };
  if (app.candidateId !== candidateId) {
    return { ok: false, error: "Application doesn't belong to this candidate." };
  }

  await prisma.application.delete({ where: { id: applicationId } });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/jobs/${app.jobId}`);
  return { ok: true };
}
