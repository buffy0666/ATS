"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth-utils";
import { createInvitation, sendInvitationEmail } from "@/lib/invitations";

export type ResendResult =
  | {
      ok: true;
      inviteUrl: string;
      email: string;
      emailSent: boolean;
      newInvitationId: string;
    }
  | { ok: false; error: string };

/**
 * Resend (or recover) an invitation as the platform admin. The original
 * token was sha256-hashed at rest, so we can't surface it again — we
 * issue a fresh token with the same email/org/role/asOwner flag, expire
 * the old row, and return the new URL.
 *
 * Works on rows in any state:
 *   - pending → new link, old link killed
 *   - expired → same; recovers a lost invitation
 *   - accepted → refused (the invitee already has an account)
 */
export async function resendPlatformInvitationAction(
  _prevState: ResendResult | undefined,
  formData: FormData,
): Promise<ResendResult> {
  const platformAdmin = await requirePlatformAdmin();

  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) return { ok: false, error: "Missing invitation id." };

  const original = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: {
      organization: { select: { id: true, name: true } },
    },
  });
  if (!original) return { ok: false, error: "Invitation not found." };
  if (original.acceptedAt) {
    return {
      ok: false,
      error: "This invitation has already been accepted — the user has an account.",
    };
  }

  // Expire the old row so its (still-hashed) token can't be redeemed in
  // a race between resend and the original recipient clicking late.
  // We deliberately don't delete — audit trail.
  await prisma.invitation.update({
    where: { id: original.id },
    data: { expiresAt: new Date() },
  });

  const { token, record } = await createInvitation({
    email: original.email,
    organizationId: original.organizationId,
    role: original.role,
    invitedByUserId: platformAdmin.user.id,
    asOwner: original.asOwner,
  });

  const appOrigin = await resolveAppOrigin();
  const inviteUrl = `${appOrigin}/invite/${token}`;

  let emailSent = true;
  try {
    await sendInvitationEmail({
      to: original.email,
      token,
      appOrigin,
      organizationName: original.organization.name,
      inviterName: platformAdmin.user.name ?? platformAdmin.user.email,
      asOwner: original.asOwner,
    });
  } catch {
    emailSent = false;
  }

  revalidatePath(`/platform/organizations/${original.organizationId}`);

  return {
    ok: true,
    inviteUrl,
    email: original.email,
    emailSent,
    newInvitationId: record.id,
  };
}

/**
 * Permanently kill a pending invitation. Sets expiresAt to now so the
 * token can't be redeemed even if the recipient clicks immediately. The
 * row stays in the DB for audit purposes (with `acceptedAt = null` and a
 * past `expiresAt`, the UI will categorize it as "expired").
 */
export async function revokePlatformInvitationAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) return;

  const inv = await prisma.invitation.findUnique({
    where: { id: invitationId },
    select: { organizationId: true, acceptedAt: true },
  });
  if (!inv || inv.acceptedAt) return;

  await prisma.invitation.update({
    where: { id: invitationId },
    data: { expiresAt: new Date() },
  });

  revalidatePath(`/platform/organizations/${inv.organizationId}`);
}

async function resolveAppOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "";
  return `${proto}://${host}`;
}
