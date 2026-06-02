"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditCreate, auditDelete, auditUpdate } from "@/lib/audit/write";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { JobStatus, Stage } from "@/generated/prisma";
import { removeAttachmentFile, saveAttachment } from "@/lib/uploads";
import { CONTRACT_ALLOWED_TYPES, CONTRACT_MAX_BYTES, JOB_TYPES } from "./constants";

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
  hiringProcess: z.string().max(10_000).optional().or(z.literal("")).transform((v) => v || null),
  jobType: z
    .enum(JOB_TYPES)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

const hiringManagerSchema = z.object({
  name: z.string().trim().max(160),
  email: z.string().trim().max(200),
  phone: z.string().trim().max(60),
  chat: z.string().trim().max(300),
  comments: z.string().trim().max(5000).optional().default(""),
});

// Parse the serialized hiring-manager list from the hidden JSON form field.
// Drops fully-empty rows; tolerates malformed JSON by returning [].
function parseHiringManagers(raw: FormDataEntryValue | null): {
  name: string;
  email: string | null;
  phone: string | null;
  chat: string | null;
  comments: string | null;
}[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const result: {
    name: string;
    email: string | null;
    phone: string | null;
    chat: string | null;
    comments: string | null;
  }[] = [];
  for (const row of parsed) {
    const m = hiringManagerSchema.safeParse(row);
    if (!m.success) continue;
    const { name, email, phone, chat, comments } = m.data;
    if (!name && !email && !phone && !chat && !comments) continue;
    result.push({
      name: name || "(unnamed)",
      email: email || null,
      phone: phone || null,
      chat: chat || null,
      comments: comments || null,
    });
  }
  return result;
}

type SavedContract = { name: string; url: string; size: number; mimeType: string | null };

// Save each uploaded contract file (validating size + type). Throws on the
// first invalid file so the caller can surface a clean error.
async function saveContractFiles(formData: FormData): Promise<SavedContract[]> {
  const files = (formData.getAll("contract") as File[]).filter(
    (f) => f instanceof File && f.size > 0,
  );
  const saved: SavedContract[] = [];
  for (const file of files) {
    if (file.size > CONTRACT_MAX_BYTES) {
      throw new Error(`"${file.name}" exceeds the 20 MB limit.`);
    }
    if (file.type && !CONTRACT_ALLOWED_TYPES.has(file.type)) {
      throw new Error(`"${file.name}" is an unsupported file type.`);
    }
    const r = await saveAttachment(file, "job-contracts");
    saved.push({ name: r.name, url: r.url, size: r.size, mimeType: r.mimeType });
  }
  return saved;
}

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
    hiringProcess: formData.get("hiringProcess"),
    jobType: formData.get("jobType"),
  });

  const managers = parseHiringManagers(formData.get("hiringManagers"));
  const contracts = await saveContractFiles(formData);

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
    data: {
      ...data,
      createdById: session.user.id,
      organizationId: orgId,
      hiringManagers: managers.length > 0 ? { create: managers } : undefined,
      contracts:
        contracts.length > 0
          ? {
              create: contracts.map((c) => ({
                name: c.name,
                url: c.url,
                size: c.size,
                mimeType: c.mimeType,
                uploadedById: session.user.id ?? null,
              })),
            }
          : undefined,
    },
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
    hiringProcess: formData.get("hiringProcess"),
    jobType: formData.get("jobType"),
  });

  const managers = parseHiringManagers(formData.get("hiringManagers"));
  const newContracts = await saveContractFiles(formData);

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
  const job = await prisma.$transaction(async (tx) => {
    const updated = await tx.job.update({ where: { id: jobId }, data });
    // Replace the hiring-manager set with whatever the form submitted (the UI
    // sends the full current list).
    await tx.jobHiringManager.deleteMany({ where: { jobId } });
    if (managers.length > 0) {
      await tx.jobHiringManager.createMany({
        data: managers.map((m) => ({ ...m, jobId })),
      });
    }
    // Append any newly uploaded contracts (existing ones are removed via the
    // dedicated deleteJobContract action, not here).
    if (newContracts.length > 0) {
      await tx.jobContract.createMany({
        data: newContracts.map((c) => ({
          jobId,
          name: c.name,
          url: c.url,
          size: c.size,
          mimeType: c.mimeType,
          uploadedById: session.user.id ?? null,
        })),
      });
    }
    return updated;
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

/**
 * Remove a single contract attachment from a job. Org-scoped via the parent
 * job; best-effort deletes the underlying blob too.
 */
export async function deleteJobContract(contractId: string) {
  const { orgId } = await requireSessionWithOrg();

  const contract = await prisma.jobContract.findFirst({
    where: { id: contractId, job: { organizationId: orgId } },
    select: { id: true, url: true, jobId: true },
  });
  if (!contract) throw new Error("Contract not found.");

  await prisma.jobContract.delete({ where: { id: contract.id } });
  await removeAttachmentFile(contract.url).catch(() => {
    // Orphaned blob is acceptable; the row is already gone.
  });

  revalidatePath(`/jobs/${contract.jobId}`);
  revalidatePath(`/jobs/${contract.jobId}/edit`);
}
