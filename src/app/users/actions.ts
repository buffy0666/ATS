"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma";
import { sendEmail } from "@/lib/email";

const passwordPolicy = z.string().min(8, "Password must be at least 8 characters.");

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional().or(z.literal("")).transform((v) => v || null),
  password: passwordPolicy,
  role: z.nativeEnum(Role),
  sendWelcomeEmail: z
    .union([z.literal("on"), z.literal("true"), z.literal(""), z.null(), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createUser(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAdmin();

  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
    sendWelcomeEmail: formData.get("sendWelcomeEmail"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const created = await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
    },
  });

  if (parsed.data.sendWelcomeEmail) {
    await sendWelcomeEmail({
      adminUserId: session.user.id,
      adminEmail: session.user.email,
      newUser: {
        id: created.id,
        email: created.email,
        name: created.name,
      },
      tempPassword: parsed.data.password,
    });
  }

  revalidatePath("/users");
  redirect("/users");
}

async function sendWelcomeEmail({
  adminUserId,
  adminEmail,
  newUser,
  tempPassword,
}: {
  adminUserId: string;
  adminEmail: string;
  newUser: { id: string; email: string; name: string | null };
  tempPassword: string;
}) {
  const greeting = newUser.name ? `Hi ${newUser.name.split(" ")[0]},` : "Hi,";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const subject = "You've been added to the ATS";
  const text = `${greeting}

You've been added to the ATS by ${adminEmail}.

Sign in here: ${appUrl}/login

Your temporary credentials:
  Email:    ${newUser.email}
  Password: ${tempPassword}

Please change your password after your first login.

— ATS`;
  const html = text.replace(/\n/g, "<br>");

  try {
    const result = await sendEmail({
      to: newUser.email,
      subject,
      text,
      html,
      replyTo: adminEmail,
    });
    await prisma.emailLog.create({
      data: {
        fromUserId: adminUserId,
        to: newUser.email,
        replyTo: adminEmail,
        subject,
        bodyText: text,
        bodyHtml: html,
        provider: result.provider,
        providerMessageId: result.id,
        status: "SENT",
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    await prisma.emailLog.create({
      data: {
        fromUserId: adminUserId,
        to: newUser.email,
        replyTo: adminEmail,
        subject,
        bodyText: text,
        bodyHtml: html,
        provider: process.env.EMAIL_PROVIDER ?? "unknown",
        status: "FAILED",
        errorMessage,
      },
    });
    // Don't fail user creation if the email send fails — admin can resend later.
  }
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
