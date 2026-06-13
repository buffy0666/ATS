import "server-only";

import { Role } from "@/generated/prisma";

/**
 * Minimal structural shape satisfied by both the PrismaClient and a
 * `$transaction` client, so callers can pass either `prisma` or `tx`.
 */
type UserCounter = {
  user: {
    count(args: { where: { organizationId: string; role: Role } }): Promise<number>;
  };
};

/**
 * Decide the role a newly-created workspace member should actually get,
 * enforcing the invariant that every workspace has at least one OWNER.
 *
 * Rule: the first non-recruiter member of a workspace becomes its OWNER.
 * If the org currently has zero OWNERs and the requested role is ADMIN (or
 * OWNER), the user is promoted to OWNER. RECRUITERs are never auto-promoted
 * — a workspace that only has recruiters stays ownerless by design (there's
 * no one meant to own it yet).
 *
 * This is the self-healing counterpart to the platform-side promote/demote
 * (toggleWorkspaceOwnerAction): it stops ownerless workspaces from being
 * created in the first place, across every user-creation path (direct create,
 * invite acceptance, and the platform-default impersonation account).
 */
export async function resolveWorkspaceRole(
  db: UserCounter,
  organizationId: string,
  requestedRole: Role,
): Promise<Role> {
  if (requestedRole === Role.RECRUITER) return requestedRole;
  const ownerCount = await db.user.count({
    where: { organizationId, role: Role.OWNER },
  });
  return ownerCount === 0 ? Role.OWNER : requestedRole;
}
