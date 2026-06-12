"use server";

import { revalidatePath } from "next/cache";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Inline editor action for the candidate's "Referred by" detail. The
 * referrer is exactly one of: a workspace user, a client contact, or a
 * free-text name (for referrers who aren't in the system) — setting one
 * clears the others.
 */

export type ReferredByPayload =
  | { kind: "none" }
  | { kind: "user"; id: string }
  | { kind: "contact"; id: string }
  | { kind: "name"; name: string };

export type ReferredByResult = { ok: true } | { ok: false; error: string };

export async function updateReferredBy(
  candidateId: string,
  payload: ReferredByPayload,
): Promise<ReferredByResult> {
  const { orgId } = await requireSessionWithOrg();

  // Tenant-scope the candidate before writing anything.
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!candidate) return { ok: false, error: "Candidate not found." };

  let data: {
    referredByUserId: string | null;
    referredByContactId: string | null;
    referredByName: string | null;
  };

  switch (payload.kind) {
    case "none":
      data = { referredByUserId: null, referredByContactId: null, referredByName: null };
      break;
    case "user": {
      const user = await prisma.user.findFirst({
        where: { id: payload.id, organizationId: orgId },
        select: { id: true },
      });
      if (!user) return { ok: false, error: "User not found in your workspace." };
      data = { referredByUserId: user.id, referredByContactId: null, referredByName: null };
      break;
    }
    case "contact": {
      const contact = await prisma.clientContact.findFirst({
        where: { id: payload.id, organizationId: orgId },
        select: { id: true },
      });
      if (!contact) return { ok: false, error: "Contact not found in your workspace." };
      data = { referredByUserId: null, referredByContactId: contact.id, referredByName: null };
      break;
    }
    case "name": {
      const name = payload.name.trim();
      if (!name) return { ok: false, error: "Enter a name." };
      if (name.length > 160) return { ok: false, error: "Name too long (max 160)." };
      data = { referredByUserId: null, referredByContactId: null, referredByName: name };
      break;
    }
  }

  await prisma.candidate.update({ where: { id: candidate.id }, data });
  revalidatePath(`/candidates/${candidate.id}`);
  return { ok: true };
}
