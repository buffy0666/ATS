import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { Role } from "@/generated/prisma";

const TOKEN_PREFIX = "inv_";
const DEFAULT_EXPIRY_DAYS = 7;

/**
 * Magic-link invitations. The plaintext token is shown ONCE (embedded in
 * the email URL). We store only the SHA-256 hash so the DB is useless to
 * an attacker who exfiltrates it. The first 12 chars of the prefixed
 * token are kept as a UI preview so a tenant admin can identify a row
 * without revealing the secret.
 *
 * Token shape: "inv_" + 64 hex chars (32 bytes of entropy).
 */

export type CreateInvitationInput = {
  email: string;
  organizationId: string;
  role?: Role;
  invitedByUserId: string | null;
  asOwner?: boolean;
  expiryDays?: number;
};

export async function createInvitation(input: CreateInvitationInput) {
  const random = randomBytes(32).toString("hex");
  const token = `${TOKEN_PREFIX}${random}`;
  const tokenHash = sha256Hex(token);
  const tokenPrefix = token.slice(0, 12);
  const expiresAt = new Date(
    Date.now() + (input.expiryDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
  );

  const record = await prisma.invitation.create({
    data: {
      email: input.email.toLowerCase().trim(),
      tokenHash,
      tokenPrefix,
      role: input.role ?? Role.RECRUITER,
      organizationId: input.organizationId,
      invitedByUserId: input.invitedByUserId,
      asOwner: input.asOwner ?? false,
      expiresAt,
    },
    select: {
      id: true,
      email: true,
      tokenPrefix: true,
      role: true,
      organizationId: true,
      expiresAt: true,
      asOwner: true,
    },
  });

  return { token, record };
}

/**
 * Look up an invitation by its plaintext token. Returns the row plus a
 * status discriminator so callers can render the right UI:
 *   - "ok": invitation is valid and unused.
 *   - "expired": past expiresAt.
 *   - "accepted": already redeemed.
 *   - "not-found": no such token, or malformed.
 *
 * We deliberately surface the discriminator instead of throwing so the
 * accept page can render a friendly screen for each case.
 */
export async function lookupInvitation(token: string) {
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    return { status: "not-found" as const };
  }
  const tokenHash = sha256Hex(token);
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!inv) return { status: "not-found" as const };
  if (inv.acceptedAt) return { status: "accepted" as const, invitation: inv };
  if (inv.expiresAt < new Date()) return { status: "expired" as const, invitation: inv };
  return { status: "ok" as const, invitation: inv };
}

/**
 * Send the magic-link email. The URL the user clicks lives at
 * /invite/<plaintext-token> on whatever APP_URL is configured (with a
 * fallback to the request's own origin handled by the caller — pass
 * `appOrigin` so this helper stays env-agnostic).
 */
export async function sendInvitationEmail(args: {
  to: string;
  token: string;
  appOrigin: string;
  organizationName: string;
  inviterName: string | null;
  asOwner: boolean;
}) {
  const url = `${args.appOrigin.replace(/\/+$/, "")}/invite/${args.token}`;
  const subjectVerb = args.asOwner ? "Set up" : "Join";
  const subject = `${subjectVerb} ${args.organizationName} on ATS`;
  const greeting = args.inviterName
    ? `${args.inviterName} invited you`
    : `You've been invited`;
  const body = args.asOwner
    ? `${greeting} to be the founding admin of ${args.organizationName}'s new ATS workspace.`
    : `${greeting} to join ${args.organizationName} on the ATS.`;
  const text = [
    body,
    "",
    `Click the link below to set your password and finish setting up your account:`,
    url,
    "",
    "This link expires in 7 days. If you didn't expect this email, you can safely ignore it.",
  ].join("\n");
  const html = [
    `<p>${escapeHtml(body)}</p>`,
    `<p>Click the link below to set your password and finish setting up your account:</p>`,
    `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
    `<p style="color:#666;font-size:12px">This link expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>`,
  ].join("");

  await sendEmail({ to: args.to, subject, text, html });
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
