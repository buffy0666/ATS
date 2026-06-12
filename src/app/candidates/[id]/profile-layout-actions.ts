"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { SavedSearchScope } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { sanitizeProfileLayout } from "./profile-fields";

export type ProfileLayoutActionResult = { ok: true; id?: string } | { ok: false; error: string };

const MAX_CONFIG = 8000;

// config must be JSON that sanitizes to a usable ProfileLayoutConfig.
const configSchema = z
  .string()
  .trim()
  .max(MAX_CONFIG)
  .refine((s) => {
    try {
      return sanitizeProfileLayout(JSON.parse(s)) !== null;
    } catch {
      return false;
    }
  }, "Invalid layout config.");

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scope: z.nativeEnum(SavedSearchScope).default(SavedSearchScope.PERSONAL),
  config: configSchema,
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  scope: z.nativeEnum(SavedSearchScope).optional(),
  config: configSchema.optional(),
});

export async function createProfileLayout(input: {
  name: string;
  scope: SavedSearchScope;
  config: string;
}): Promise<ProfileLayoutActionResult> {
  const { session, orgId } = await requireSessionWithOrg();
  let data;
  try {
    data = createSchema.parse(input);
  } catch {
    return { ok: false, error: "Enter a name and a valid layout." };
  }

  const created = await prisma.profileLayout.create({
    data: {
      name: data.name,
      scope: data.scope,
      config: data.config,
      ownerId: session.user.id,
      organizationId: orgId,
    },
    select: { id: true },
  });

  revalidatePath("/candidates", "layout");
  return { ok: true, id: created.id };
}

export async function updateProfileLayout(
  id: string,
  input: { name?: string; scope?: SavedSearchScope; config?: string },
): Promise<ProfileLayoutActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  let data;
  try {
    data = updateSchema.parse(input);
  } catch {
    return { ok: false, error: "Invalid update." };
  }

  // findUnique by id; owner-only — a guessed id from another user can't be edited.
  const existing = await prisma.profileLayout.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!existing) return { ok: false, error: "Layout not found." };
  if (existing.ownerId !== session.user.id) {
    return { ok: false, error: "Only the owner can change this layout." };
  }

  await prisma.profileLayout.update({ where: { id }, data });
  revalidatePath("/candidates", "layout");
  return { ok: true, id };
}

export async function deleteProfileLayout(id: string): Promise<ProfileLayoutActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };

  const existing = await prisma.profileLayout.findUnique({
    where: { id },
    select: { ownerId: true },
  });
  if (!existing) return { ok: true };
  if (existing.ownerId !== session.user.id) {
    return { ok: false, error: "Only the owner can delete this layout." };
  }

  await prisma.profileLayout.delete({ where: { id } });
  revalidatePath("/candidates", "layout");
  return { ok: true };
}
