"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  requireAdmin,
  requireAdminWithOrg,
  requireCanCreateGlobalAdmin,
} from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma";
import { sendEmail } from "@/lib/email";
import { createInvitation, sendInvitationEmail } from "@/lib/invitations";

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
  // Use requireAdminWithOrg so the new user gets the admin's organizationId
  // — without this, /users/new silently created orgless users which then
  // hit the /onboarding redirect loop. This was a Phase 3 carryover bug.
  const { session, orgId } = await requireAdminWithOrg();

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

  // Middle-tier ADMIN may only create RECRUITER or ADMIN — never OWNER.
  // Only OWNERs can spin up another OWNER.
  if (parsed.data.role === Role.OWNER && session.user.role !== Role.OWNER) {
    return {
      ok: false,
      error: "Only an owner can create another OWNER.",
    };
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
      organizationId: orgId,
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

export type UpdateRoleResult = { ok: true } | { ok: false; error: string };

export async function updateUserRole(
  userId: string,
  role: Role,
): Promise<UpdateRoleResult> {
  const { session, orgId } = await requireAdminWithOrg();
  const viewerIsOwner = session.user.role === Role.OWNER;

  // Look up the target so we know whether the viewer is allowed to touch
  // them and whether changing their role would leave the org orphaned.
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: orgId },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, error: "User not found in your workspace." };

  // ADMIN can't promote anyone to OWNER, can't edit an OWNER's role.
  if (!viewerIsOwner && (role === Role.OWNER || target.role === Role.OWNER)) {
    return { ok: false, error: "Only an owner can manage OWNER roles." };
  }

  // Never let an org end up with zero OWNERs.
  if (target.role === Role.OWNER && role !== Role.OWNER) {
    const owners = await prisma.user.count({
      where: { organizationId: orgId, role: Role.OWNER },
    });
    if (owners <= 1) {
      return {
        ok: false,
        error: "At least one OWNER must remain in this workspace.",
      };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
  return { ok: true };
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

// ---- Teammate invitations (Phase 4c) -----------------------------------

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.nativeEnum(Role),
});

export type InviteResult =
  | { ok: true; email: string; inviteUrl: string; emailSent: boolean }
  | { ok: false; error: string };

/**
 * Send a magic-link invitation to a new teammate. They click the link in
 * their email, set a password + name, and join the inviting org as a
 * RECRUITER or ADMIN (whichever the inviter selected).
 *
 * Why this exists alongside createUser: createUser sets a temp password
 * we then email in cleartext, which is fine for internal use but bad
 * security hygiene for sales-led customer onboarding. The magic link
 * never exposes a reusable secret on the wire.
 */
export async function inviteTeammateAction(
  _prev: InviteResult | undefined,
  formData: FormData,
): Promise<InviteResult> {
  const { session, orgId, orgName } = await requireAdminWithOrg();

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Middle-tier ADMIN can't invite anyone in as OWNER.
  if (parsed.data.role === Role.OWNER && session.user.role !== Role.OWNER) {
    return { ok: false, error: "Only an owner can invite another OWNER." };
  }

  // Don't invite an email that's already a user — either they're already
  // in this org (no-op) or they're in another tenant (which we don't
  // allow cross-attaching).
  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { organizationId: true },
  });
  if (existing) {
    return {
      ok: false,
      error:
        existing.organizationId === orgId
          ? "That user is already in your workspace."
          : "A user with that email already exists in another workspace.",
    };
  }

  // If a pending invitation already exists for this email + org, just
  // resend it instead of creating a duplicate (which would orphan the
  // first one).
  const existingInvite = await prisma.invitation.findFirst({
    where: {
      email: parsed.data.email,
      organizationId: orgId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (existingInvite) {
    // Soft-delete the old invitation so the new token replaces it. We
    // don't physically delete (audit trail) — instead mark it expired so
    // it can't be redeemed.
    await prisma.invitation.update({
      where: { id: existingInvite.id },
      data: { expiresAt: new Date() },
    });
  }

  const { token } = await createInvitation({
    email: parsed.data.email,
    organizationId: orgId,
    role: parsed.data.role,
    invitedByUserId: session.user.id,
    asOwner: false,
  });

  const appOrigin = await resolveAppOrigin();
  const inviteUrl = `${appOrigin}/invite/${token}`;

  let emailSent = true;
  try {
    await sendInvitationEmail({
      to: parsed.data.email,
      token,
      appOrigin,
      organizationName: orgName ?? "your workspace",
      inviterName: session.user.name ?? session.user.email,
      asOwner: false,
    });
  } catch {
    emailSent = false;
  }

  revalidatePath("/users");
  return { ok: true, email: parsed.data.email, inviteUrl, emailSent };
}

/**
 * Resend a pending invitation. Generates a fresh token (the old one is
 * left expired in place for audit), pushes the expiry out by another
 * 14 days, and re-sends the email. Tenant-scoped — an admin can only
 * resend invitations from their own workspace.
 */
export async function resendInvitation(invitationId: string): Promise<ActionResult> {
  const { session, orgId, orgName } = await requireAdminWithOrg();

  const inv = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: orgId, acceptedAt: null },
    select: { id: true, email: true, role: true },
  });
  if (!inv) return { ok: false, error: "Invitation not found." };

  // Mark the existing invitation expired (audit trail) and mint a new
  // one with the same email + role. This re-uses the same flow as the
  // "duplicate invite" path in inviteTeammateAction.
  await prisma.invitation.update({
    where: { id: inv.id },
    data: { expiresAt: new Date() },
  });

  const { token } = await createInvitation({
    email: inv.email,
    organizationId: orgId,
    role: inv.role,
    invitedByUserId: session.user.id,
    asOwner: false,
  });

  const appOrigin = await resolveAppOrigin();
  try {
    await sendInvitationEmail({
      to: inv.email,
      token,
      appOrigin,
      organizationName: orgName ?? "your workspace",
      inviterName: session.user.name ?? session.user.email,
      asOwner: false,
    });
  } catch {
    // Even if the email fails, the new invitation row is valid — the
    // admin can copy the link from the page if needed.
  }

  revalidatePath("/users");
  return { ok: true };
}

/**
 * Revoke a pending invitation by expiring it immediately. The row is
 * kept (audit trail) but can no longer be redeemed.
 */
export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  const { orgId } = await requireAdminWithOrg();

  const inv = await prisma.invitation.findFirst({
    where: { id: invitationId, organizationId: orgId, acceptedAt: null },
    select: { id: true },
  });
  if (!inv) return { ok: false, error: "Invitation not found." };

  await prisma.invitation.update({
    where: { id: inv.id },
    data: { expiresAt: new Date() },
  });

  revalidatePath("/users");
  return { ok: true };
}

async function resolveAppOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  return `${proto}://${host}`;
}

// ---- Global admin creation (restricted) ---------------------------------

const globalAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(120).optional().or(z.literal("")).transform((v) => v || null),
  password: z.string().min(10, "Password must be at least 10 characters."),
});

export type CreateGlobalAdminResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

/**
 * Create a new platform admin (isPlatformAdmin = true). Gated to the
 * hardcoded GLOBAL_ADMIN_CREATOR_EMAILS allowlist in lib/auth-utils.ts.
 *
 * The new user is also created as a tenant ADMIN inside the creator's
 * current organization, so they have a working tenant context to dogfood
 * from. They can move to a different org later by accepting an
 * invitation, or you can demote them out of this org via the regular
 * user-management UI.
 */
export async function createGlobalAdminAction(
  _prev: CreateGlobalAdminResult | undefined,
  formData: FormData,
): Promise<CreateGlobalAdminResult> {
  // First gate: must be an authenticated tenant ADMIN with an org —
  // matches the existing /users/new flow's invariants.
  const { orgId } = await requireAdminWithOrg();
  // Second gate: must be in the hardcoded creator allowlist. This is a
  // separate check because not every tenant admin should be able to
  // mint platform admins.
  await requireCanCreateGlobalAdmin();

  const parsed = globalAdminSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, isPlatformAdmin: true, organizationId: true },
  });
  if (existing) {
    return {
      ok: false,
      error: existing.isPlatformAdmin
        ? `${parsed.data.email} is already a platform admin.`
        : `${parsed.data.email} already has an account. Promote them from /platform/organizations instead.`,
    };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      // Platform admins are seeded as OWNERs of their bootstrap tenant
      // so they have full per-tenant access too.
      role: Role.OWNER,
      organizationId: orgId,
      isPlatformAdmin: true,
    },
  });

  revalidatePath("/users");
  return { ok: true, email: parsed.data.email };
}
