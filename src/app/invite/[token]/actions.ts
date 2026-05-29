"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { lookupInvitation } from "@/lib/invitations";

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
      const user = await tx.user.create({
        data: {
          email: invitation.email,
          name,
          passwordHash,
          role: invitation.role,
          organizationId: invitation.organizationId,
        },
        select: { id: true },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date(), acceptedUserId: user.id },
      });

      // If this was the founding-owner invite, set the org's
      // ownerUserId — but only if the slot is still empty (a race with
      // a manual DB edit shouldn't clobber an existing owner).
      if (invitation.asOwner) {
        await tx.organization.updateMany({
          where: { id: invitation.organizationId, ownerUserId: null },
          data: { ownerUserId: user.id },
        });
        // Defense in depth: invitations with asOwner should always have
        // role=OWNER. Promote just in case the row was tampered with.
        if (invitation.role !== Role.OWNER) {
          await tx.user.update({
            where: { id: user.id },
            data: { role: Role.OWNER },
          });
        }
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
