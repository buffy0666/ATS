"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New password and confirmation don't match.",
    path: ["confirmPassword"],
  });

/**
 * Self-service password change. Verifies the caller's current password
 * before setting a new one — so a hijacked-but-unlocked session still can't
 * silently rotate the password without knowing the old one.
 */
export async function changeMyPassword(
  _prev: ChangePasswordResult | undefined,
  formData: FormData,
): Promise<ChangePasswordResult> {
  const session = await requireSession();
  const userId = session.user.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) return { ok: false, error: "Account not found." };

  const currentMatches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!currentMatches) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const sameAsOld = await bcrypt.compare(parsed.data.newPassword, user.passwordHash);
  if (sameAsOld) {
    return { ok: false, error: "New password must be different from your current one." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return { ok: true };
}
