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
  });

  const job = await prisma.job.create({
    data: { ...data, createdById: session.user.id },
  });

  revalidatePath("/jobs");
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
