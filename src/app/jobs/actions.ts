"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditCreate, auditDelete, auditUpdate } from "@/lib/audit/write";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { JobStatus, Stage } from "@/generated/prisma";

const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v ?? null;
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number.parseInt(trimmed.replace(/[,$\s]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }, z.number().int().min(min).max(max).nullable());

const jobSchema = z.object({
  title: z.string().min(1).max(200),
  department: z.string().max(100).optional().or(z.literal("")).transform((v) => v || null),
  location: z.string().max(100).optional().or(z.literal("")).transform((v) => v || null),
  description: z.string().min(1),
  status: z.nativeEnum(JobStatus).default(JobStatus.OPEN),
  clientId: z.string().optional().or(z.literal("")).transform((v) => v || null),
  salaryLow: optionalInt(0, 100_000_000),
  salaryHigh: optionalInt(0, 100_000_000),
  placementFeePercent: optionalInt(0, 100),
});

export async function createJob(formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();

  const data = jobSchema.parse({
    title: formData.get("title"),
    department: formData.get("department"),
    location: formData.get("location"),
    description: formData.get("description"),
    status: formData.get("status"),
    clientId: formData.get("clientId"),
    salaryLow: formData.get("salaryLow"),
    salaryHigh: formData.get("salaryHigh"),
    placementFeePercent: formData.get("placementFeePercent"),
  });

  // Cross-tenant guard: if a clientId was picked, it must belong to this
  // org. Otherwise drop it (the form's <select> is org-scoped so this is
  // belt-and-suspenders against a hand-crafted POST).
  if (data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, organizationId: orgId },
      select: { id: true },
    });
    if (!client) data.clientId = null;
  }

  const job = await prisma.job.create({
    data: { ...data, createdById: session.user.id, organizationId: orgId },
  });
  await auditCreate("Job", job as unknown as Record<string, unknown>);

  revalidatePath("/jobs");
  revalidatePath("/clients");
  if (job.clientId) revalidatePath(`/clients/${job.clientId}`);
  redirect(`/jobs/${job.id}`);
}

export async function addCandidateToJob(jobId: string, candidateId: string) {
  const { orgId } = await requireSessionWithOrg();

  // Verify both belong to this org before linking.
  const [job, candidate] = await Promise.all([
    prisma.job.findFirst({
      where: { id: jobId, organizationId: orgId },
      select: { id: true },
    }),
    prisma.candidate.findFirst({
      where: { id: candidateId, organizationId: orgId },
      select: { id: true },
    }),
  ]);
  if (!job || !candidate) throw new Error("Not found in this organization");

  await prisma.application.upsert({
    where: { jobId_candidateId: { jobId, candidateId } },
    update: {},
    create: { jobId, candidateId, stage: Stage.APPLIED, organizationId: orgId },
  });

  revalidatePath(`/jobs/${jobId}`);
}

export async function updateJob(jobId: string, formData: FormData) {
  const { orgId } = await requireSessionWithOrg();

  const data = jobSchema.parse({
    title: formData.get("title"),
    department: formData.get("department"),
    location: formData.get("location"),
    description: formData.get("description"),
    status: formData.get("status"),
    clientId: formData.get("clientId"),
    salaryLow: formData.get("salaryLow"),
    salaryHigh: formData.get("salaryHigh"),
    placementFeePercent: formData.get("placementFeePercent"),
  });

  // Verify the job belongs to this org; reject otherwise.
  const existing = await prisma.job.findFirst({
    where: { id: jobId, organizationId: orgId },
    select: { id: true },
  });
  if (!existing) throw new Error("Job not found.");

  // Same cross-tenant guard on clientId as createJob.
  if (data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, organizationId: orgId },
      select: { id: true },
    });
    if (!client) data.clientId = null;
  }

  const before = await prisma.job.findUnique({ where: { id: jobId } });
  const job = await prisma.job.update({
    where: { id: jobId },
    data,
  });
  await auditUpdate(
    "Job",
    before as unknown as Record<string, unknown> | null,
    job as unknown as Record<string, unknown>,
  );

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  if (job.clientId) revalidatePath(`/clients/${job.clientId}`);
  redirect(`/jobs/${jobId}`);
}

export async function deleteJob(jobId: string) {
  const { orgId } = await requireSessionWithOrg();

  // Read the full row so the audit has the snapshot to display.
  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId: orgId },
  });
  if (!job) throw new Error("Job not found.");

  // Application has onDelete: Cascade so all applications + their notes/emails get cleaned up.
  await prisma.job.delete({ where: { id: jobId } });
  await auditDelete("Job", job as unknown as Record<string, unknown>);

  revalidatePath("/jobs");
  if (job.clientId) revalidatePath(`/clients/${job.clientId}`);
  redirect("/jobs");
}

export async function updateApplicationStage(applicationId: string, stage: Stage) {
  const { orgId } = await requireSessionWithOrg();

  const app = await prisma.application.findFirst({
    where: { id: applicationId, organizationId: orgId },
    select: { id: true, jobId: true },
  });
  if (!app) throw new Error("Application not found.");

  await prisma.application.update({
    where: { id: app.id },
    data: { stage },
  });

  revalidatePath(`/jobs/${app.jobId}`);
}
