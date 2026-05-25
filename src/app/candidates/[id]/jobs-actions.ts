"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Stage } from "@/generated/prisma";

/**
 * Server actions backing the Jobs section on the candidate detail page.
 *
 * All three actions revalidate the candidate detail path AND the job detail
 * path so a pipeline view of the affected job stays in sync.
 *
 * Multi-tenant: every read and write requires the candidate AND the job
 * (or the application) to belong to the caller's org.
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
  const { orgId } = await requireSessionWithOrg();

  const parsed = z.string().min(1).safeParse(jobId);
  if (!parsed.success) return { ok: false, error: "Invalid job id." };

  // Verify both records exist in this org before writing — clearer error
  // than a FK violation, and prevents cross-tenant linkage.
  const [candidate, job] = await Promise.all([
    prisma.candidate.findFirst({
      where: { id: candidateId, organizationId: orgId },
      select: { id: true },
    }),
    prisma.job.findFirst({
      where: { id: jobId, organizationId: orgId },
      select: { id: true },
    }),
  ]);
  if (!candidate) return { ok: false, error: "Candidate not found." };
  if (!job) return { ok: false, error: "Job not found." };

  await prisma.application.upsert({
    where: { jobId_candidateId: { jobId, candidateId } },
    update: {},
    create: { jobId, candidateId, stage: Stage.APPLIED, organizationId: orgId },
  });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/**
 * Change the pipeline stage of a candidate on a specific job.
 */
export async function updateApplicationStage(
  applicationId: string,
  candidateId: string,
  newStage: Stage,
): Promise<JobActionResult> {
  const { orgId } = await requireSessionWithOrg();

  if (!Object.values(Stage).includes(newStage)) {
    return { ok: false, error: "Unknown stage." };
  }

  const app = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: orgId },
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
  const { orgId } = await requireSessionWithOrg();

  const app = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: orgId },
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
