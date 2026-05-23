"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth-utils";
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

export async function createList(formData: FormData) {
  const session = await requireSession();
  const data = listSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    scope: formData.get("scope"),
  });
  const list = await prisma.candidateList.create({
    data: { ...data, ownerId: session.user.id },
    select: { id: true },
  });
  revalidatePath("/lists");
  redirect(`/lists/${list.id}`);
}

export async function updateList(listId: string, formData: FormData) {
  const session = await requireSession();
  const existing = await prisma.candidateList.findUnique({
    where: { id: listId },
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
  await prisma.candidateList.update({ where: { id: listId }, data });
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

export async function deleteList(listId: string) {
  const session = await requireSession();
  const existing = await prisma.candidateList.findUnique({
    where: { id: listId },
    select: { ownerId: true },
  });
  if (!existing) throw new Error("List not found");
  if (existing.ownerId !== session.user.id) {
    throw new Error("Only the owner can delete this list");
  }
  // CandidateListMember rows cascade-delete via the relation onDelete: Cascade.
  await prisma.candidateList.delete({ where: { id: listId } });
  revalidatePath("/lists");
  redirect("/lists");
}
