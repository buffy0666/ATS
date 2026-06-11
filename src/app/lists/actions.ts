"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ListScope } from "@/generated/prisma";

const listSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  scope: z.nativeEnum(ListScope).default(ListScope.PERSONAL),
});

// Keep only the submitted job ids that actually belong to this org (drops any
// cross-tenant or stale ids). Order/dedupe-safe.
async function validJobIds(ids: string[], orgId: string): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await prisma.job.findMany({
    where: { id: { in: unique }, organizationId: orgId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// Same cross-tenant guard for assignees — must be active users in this org.
async function validUserIds(ids: string[], orgId: string): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await prisma.user.findMany({
    where: { id: { in: unique }, organizationId: orgId, active: true },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function createList(formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();
  const data = listSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    scope: formData.get("scope"),
  });
  const [jobIds, assigneeIds] = await Promise.all([
    validJobIds(formData.getAll("jobIds").map(String), orgId),
    validUserIds(formData.getAll("assigneeIds").map(String), orgId),
  ]);

  const list = await prisma.candidateList.create({
    data: {
      ...data,
      ownerId: session.user.id,
      organizationId: orgId,
      jobs: { create: jobIds.map((jobId) => ({ jobId })) },
      assignees: {
        create: assigneeIds.map((userId) => ({
          userId,
          assignedById: session.user.id,
        })),
      },
    },
    select: { id: true },
  });
  revalidatePath("/lists");
  redirect(`/lists/${list.id}`);
}

export async function updateList(listId: string, formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();
  const existing = await prisma.candidateList.findFirst({
    where: { id: listId, organizationId: orgId },
    select: { ownerId: true },
  });
  if (!existing) throw new Error("List not found");
  if (existing.ownerId !== session.user.id) {
    throw new Error("Only the owner can edit this list");
  }
  const data = listSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    scope: formData.get("scope"),
  });
  const [jobIds, assigneeIds] = await Promise.all([
    validJobIds(formData.getAll("jobIds").map(String), orgId),
    validUserIds(formData.getAll("assigneeIds").map(String), orgId),
  ]);

  // Replace the job + assignee sets with whatever the form submitted (the UI
  // sends the full current selection).
  await prisma.$transaction(async (tx) => {
    await tx.candidateList.update({ where: { id: listId }, data });
    await tx.candidateListJob.deleteMany({ where: { listId } });
    if (jobIds.length > 0) {
      await tx.candidateListJob.createMany({
        data: jobIds.map((jobId) => ({ listId, jobId })),
        skipDuplicates: true,
      });
    }
    await tx.candidateListAssignee.deleteMany({ where: { listId } });
    if (assigneeIds.length > 0) {
      await tx.candidateListAssignee.createMany({
        data: assigneeIds.map((userId) => ({
          listId,
          userId,
          assignedById: session.user.id,
        })),
        skipDuplicates: true,
      });
    }
  });
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

export async function deleteList(listId: string) {
  const { session, orgId } = await requireSessionWithOrg();
  const existing = await prisma.candidateList.findFirst({
    where: { id: listId, organizationId: orgId },
    select: { ownerId: true },
  });
  if (!existing) throw new Error("List not found");
  if (existing.ownerId !== session.user.id) {
    throw new Error("Only the owner can delete this list");
  }
  // CandidateListMember / CandidateListJob / CandidateListAssignee rows
  // cascade-delete via their onDelete: Cascade relations.
  await prisma.candidateList.delete({ where: { id: listId } });
  revalidatePath("/lists");
  redirect("/lists");
}
