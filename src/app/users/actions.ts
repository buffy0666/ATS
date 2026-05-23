"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma";

const passwordPolicy = z.string().min(8, "Password must be at least 8 characters.");

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional().or(z.literal("")).transform((v) => v || null),
  password: passwordPolicy,
  role: z.nativeEnum(Role),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createUser(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
    },
  });

  revalidatePath("/users");
  redirect("/users");
}

export async function updateUserRole(userId: string, role: Role) {
  const session = await requireAdmin();

  if (userId === session.user.id && role !== Role.ADMIN) {
    throw new Error("You can't remove admin from your own account.");
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
}

const resetSchema = z.object({ password: passwordPolicy });

export async function resetUserPassword(
  userId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = resetSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return { ok: true };
}

export async function deleteUser(userId: string) {
  const session = await requireAdmin();
  if (userId === session.user.id) {
    throw new Error("You can't delete your own account.");
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/users");
  redirect("/users");
}
