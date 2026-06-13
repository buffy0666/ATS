"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { lookupInvitation } from "@/lib/invitations";
import { resolveWorkspaceRole } from "@/lib/workspace-roles";

const schema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(10).max(200),
});

export type AcceptResult = { ok: true } | { ok: false; error: string };

/**
 * Accept a magic-link invitation: create the User, attach to the
 * Organization, mark the Invitation accepted, and (if asOwner) set
 * Organization.ownerUserId. All in one transaction so a partial failure
 * doesn't leave a half-created user.
 *
 * On success, redirects to /login with the email pre-filled so the
 * invitee signs in cleanly with their newly-set password.
 */
export async function acceptInvitationAction(
  _prevState: AcceptResult,
  formData: FormData,
): Promise<AcceptResult> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form data." };
  }
  const { token, name, password } = parsed.data;

  // Re-lookup inside the action so a token that was valid when the page
  // rendered but used between page-load and submit doesn't slip through.
  const result = await lookupInvitation(token);
  if (result.status !== "ok") {
    return {
      ok: false,
      error:
        result.status === "expired"
          ? "This invitation expired. Ask the inviter to send a new one."
          : result.status === "accepted"
            ? "This invitation was already used."
            : "Invitation not found.",
    };
  }
  const invitation = result.invitation;

  // Re-check that the email isn't already in use. Could have happened
  // between invitation creation and acceptance (e.g. invitee signed up
  // separately via /signup with the same email).
  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error:
        "A user with this email already exists. Sign in instead — or ask for an invite to be sent to a different email.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      // First non-recruiter member of a workspace becomes its OWNER, so a
      // workspace can never end up ownerless (see resolveWorkspaceRole).
      // This also covers the founding-owner invite (role=OWNER) naturally.
      let role = await resolveWorkspaceRole(tx, invitation.organizationId, invitation.role);
      // Defense in depth: an asOwner invite should always land as OWNER even
      // if its stored role was tampered with.
      if (invitation.asOwner) role = Role.OWNER;

      const user = await tx.user.create({
        data: {
          email: invitation.email,
          name,
          passwordHash,
          role,
          organizationId: invitation.organizationId,
        },
        select: { id: true },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date(), acceptedUserId: user.id },
      });

      // Whenever this user is (or becomes) an OWNER, point the org's
      // ownerUserId at them — but only if the slot is still empty (a race
      // with a manual DB edit shouldn't clobber an existing owner).
      if (role === Role.OWNER) {
        await tx.organization.updateMany({
          where: { id: invitation.organizationId, ownerUserId: null },
          data: { ownerUserId: user.id },
        });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to accept.";
    return {
      ok: false,
      error: message.includes("Unique constraint")
        ? "A user with this email already exists. Sign in instead."
        : "Couldn't accept the invitation. Try again in a moment.",
    };
  }

  redirect(`/login?email=${encodeURIComponent(invitation.email)}&fresh=1`);
}
