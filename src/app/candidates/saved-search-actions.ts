"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { SavedSearchScope } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const saveSchema = z.object({
  name: z.string().trim().min(1).max(120),
  paramsString: z.string().trim().max(4000),
  scope: z.nativeEnum(SavedSearchScope).default(SavedSearchScope.PERSONAL),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scope: z.nativeEnum(SavedSearchScope).optional(),
});

export async function createSavedSearch(input: {
  name: string;
  paramsString: string;
  scope: SavedSearchScope;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const data = saveSchema.parse(input);
  await prisma.savedSearch.create({
    data: {
      name: data.name,
      paramsString: data.paramsString.replace(/^\?+/, ""),
      scope: data.scope,
      ownerId: session.user.id,
    },
  });

  revalidatePath("/candidates");
}

export async function updateSavedSearch(
  id: string,
  input: { name?: string; scope?: SavedSearchScope },
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const data = updateSchema.parse(input);
  const existing = await prisma.savedSearch.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!existing) throw new Error("Saved search not found");
  if (existing.ownerId !== session.user.id) {
    throw new Error("Only the owner can rename or change scope.");
  }

  await prisma.savedSearch.update({ where: { id }, data });
  revalidatePath("/candidates");
}

export async function deleteSavedSearch(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = await prisma.savedSearch.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!existing) return;
  if (existing.ownerId !== session.user.id) {
    throw new Error("Only the owner can delete this saved search.");
  }

  await prisma.savedSearch.delete({ where: { id } });
  revalidatePath("/candidates");
}
