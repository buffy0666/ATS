"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { Role } from "@/generated/prisma";
import { requirePlatformAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createInvitation, sendInvitationEmail } from "@/lib/invitations";

const schema = z.object({
  organizationName: z.string().trim().min(1).max(120),
  ownerEmail: z.string().trim().toLowerCase().email().max(200),
});

export type CreateTenantResult =
  | {
      ok: true;
      organizationName: string;
      email: string;
      inviteUrl: string;
    }
  | { ok: false; error: string };

/**
 * Platform-admin only. Creates a brand-new Organization (no owner yet),
 * then an Invitation row marked `asOwner: true`, then emails the
 * magic-link URL to the designated owner. When they click it and set a
 * password, they're promoted to founding ADMIN + Organization.ownerUserId
 * in /invite/[token]/actions.ts.
 *
 * Idempotency: if there's already a user with that email, we refuse —
 * we don't want to silently attach an existing recruiter from another
 * tenant to this new org.
 */
export async function createTenantAction(
  _prevState: CreateTenantResult,
  formData: FormData,
): Promise<CreateTenantResult> {
  const platformAdmin = await requirePlatformAdmin();

  const parsed = schema.safeParse({
    organizationName: formData.get("organizationName"),
    ownerEmail: formData.get("ownerEmail"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data." };
  }
  const { organizationName, ownerEmail } = parsed.data;

  // Prevent attaching an existing user to a new org. They should accept
  // a teammate invite into their existing tenant instead.
  const existingUser = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true },
  });
  if (existingUser) {
    return {
      ok: false,
      error: `A user with email ${ownerEmail} already exists. They can't own a new tenant — pick a different email.`,
    };
  }

  const slug = await pickAvailableSlug(slugify(organizationName));

  let organizationId: string;
  try {
    const org = await prisma.organization.create({
      data: { name: organizationName, slug },
      select: { id: true },
    });
    organizationId = org.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Setup failed.";
    return {
      ok: false,
      error: message.includes("Unique constraint")
        ? "That workspace name is taken — try a different one."
        : "Couldn't create the tenant. Try again.",
    };
  }

  const { token } = await createInvitation({
    email: ownerEmail,
    organizationId,
    role: Role.ADMIN,
    invitedByUserId: platformAdmin.user.id,
    asOwner: true,
  });

  // Compute the magic-link URL. APP_URL preferred; otherwise derive from
  // the current request — works in any dev/preview environment.
  const appOrigin = await resolveAppOrigin();
  const inviteUrl = `${appOrigin}/invite/${token}`;

  // Send the email. If delivery fails we still show the URL on screen so
  // the platform admin can manually copy/paste it.
  let emailSent = true;
  try {
    await sendInvitationEmail({
      to: ownerEmail,
      token,
      appOrigin,
      organizationName,
      inviterName: platformAdmin.user.name ?? platformAdmin.user.email,
      asOwner: true,
    });
  } catch {
    emailSent = false;
  }

  return {
    ok: true,
    organizationName,
    email: ownerEmail,
    inviteUrl:
      (emailSent ? "" : "(email delivery failed) ") + inviteUrl,
  };
}

async function resolveAppOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  // Derive from request as a fallback.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  return `${proto}://${host}`;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "workspace"
  );
}

async function pickAvailableSlug(base: string): Promise<string> {
  const existing = await prisma.organization.findUnique({
    where: { slug: base },
    select: { id: true },
  });
  if (!existing) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}
