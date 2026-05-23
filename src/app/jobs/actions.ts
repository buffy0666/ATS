"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { JobStatus, Stage } from "@/generated/prisma";

const jobSchema = z.object({
  title: z.string().min(1).max(200),
  department: z.string().max(100).optional().or(z.literal("")).transform((v) => v || null),
  location: z.string().max(100).optional().or(z.literal("")).transform((v) => v || null),
  description: z.string().min(1),
  status: z.nativeEnum(JobStatus).default(JobStatus.OPEN),
  clientId: z.string().optional().or(z.literal("")).transform((v) => v || null),
});

export async function createJob(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const data = jobSchema.parse({
    title: formData.get("title"),
    department: formData.get("department"),
    location: formData.get("location"),
    description: formData.get("description"),
    status: formData.get("status"),
    clientId: formData.get("clientId"),
  });

  const job = await prisma.job.create({
    data: { ...data, createdById: session.user.id },
  });

  revalidatePath("/jobs");
  revalidatePath("/clients");
  if (job.clientId) revalidatePath(`/clients/${job.clientId}`);
  redirect(`/jobs/${job.id}`);
}

export async function addCandidateToJob(jobId: string, candidateId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.application.upsert({
    where: { jobId_candidateId: { jobId, candidateId } },
    update: {},
    create: { jobId, candidateId, stage: Stage.APPLIED },
  });

  revalidatePath(`/jobs/${jobId}`);
}

export async function updateJob(jobId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const data = jobSchema.parse({
    title: formData.get("title"),
    department: formData.get("department"),
    location: formData.get("location"),
    description: formData.get("description"),
    status: formData.get("status"),
    clientId: formData.get("clientId"),
  });

  const job = await prisma.job.update({
    where: { id: jobId },
    data,
  });

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  if (job.clientId) revalidatePath(`/clients/${job.clientId}`);
  redirect(`/jobs/${jobId}`);
}

export async function deleteJob(jobId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { clientId: true },
  });

  // Application has onDelete: Cascade so all applications + their notes/emails get cleaned up.
  await prisma.job.delete({ where: { id: jobId } });

  revalidatePath("/jobs");
  if (job?.clientId) revalidatePath(`/clients/${job.clientId}`);
  redirect("/jobs");
}

export async function updateApplicationStage(applicationId: string, stage: Stage) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const app = await prisma.application.update({
    where: { id: applicationId },
    data: { stage },
    select: { jobId: true },
  });

  revalidatePath(`/jobs/${app.jobId}`);
}
