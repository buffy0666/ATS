import "server-only";

import { randomBytes } from "node:crypto";
import { Role } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceRole } from "@/lib/workspace-roles";

/**
 * "Platform default" users — synthetic Default Admin / Default User
 * accounts per org. Used when a platform admin clicks Login on an org
 * that has no active user of the requested role: instead of erroring
 * out, we create (or reuse) a placeholder account in that role and
 * impersonate it.
 *
 * Security:
 *   - passwordHash is set to a sentinel non-bcrypt string. bcrypt.compare
 *     returns false on invalid hashes, so direct sign-in via /login is
 *     impossible — these can only ever be entered via impersonation.
 *   - Email follows a predictable pattern (default-<role>@<orgSlug>.platform-default.local)
 *     so they never collide with a real user's email and we can filter
 *     them out of tenant-facing views.
 *
 * Visibility:
 *   - HIDDEN from /users (tenant admin view) — see isPlatformDefaultEmail()
 *     filter in src/app/users/page.tsx.
 *   - VISIBLE on /platform/organizations/[id] (platform admin view) with
 *     a "Default" badge so you can spot them.
 */

const DEFAULT_EMAIL_DOMAIN = "platform-default.local";
const PASSWORD_HASH_SENTINEL_PREFIX = "__platform-default__";

/**
 * Stable email format for a default user. Encodes both org slug and role
 * so the email is human-readable.
 */
function roleLabelFor(role: Role): string {
  if (role === Role.OWNER) return "owner";
  if (role === Role.ADMIN) return "admin";
  return "user";
}

function defaultEmailFor(orgSlug: string, role: Role): string {
  return `default-${roleLabelFor(role)}@${orgSlug}.${DEFAULT_EMAIL_DOMAIN}`;
}

function defaultNameFor(role: Role): string {
  if (role === Role.OWNER) return "Default Owner";
  if (role === Role.ADMIN) return "Default Admin";
  return "Default User";
}

/**
 * Check whether a given email is one of our synthetic default users.
 * Used to filter them out of tenant-facing user lists.
 */
export function isPlatformDefaultEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith(`.${DEFAULT_EMAIL_DOMAIN}`);
}

/**
 * Find or create the default user with the given role in the given org.
 * Idempotent — subsequent calls reuse the same row.
 *
 * Returns null if the org doesn't exist (shouldn't happen in practice
 * since callers come from /platform routes where the org is already
 * validated).
 */
export async function findOrCreateDefaultUser(
  organizationId: string,
  role: Role,
): Promise<{ id: string; email: string; name: string | null; role: Role } | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!org) return null;

  const email = defaultEmailFor(org.slug, role);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  if (existing) {
    // Reactivate if a previous platform admin deactivated it by mistake —
    // we want the default account to always be usable.
    if (!existing.active) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { active: true, deactivatedAt: null },
      });
    }
    return existing;
  }

  // Create. The password hash is intentionally NOT a valid bcrypt hash;
  // bcrypt.compare returns false for it, so this account can never sign
  // in directly. The random suffix is just to make the value unique per
  // row (defensive — there's no functional reason it needs to be).
  const sentinelHash = `${PASSWORD_HASH_SENTINEL_PREFIX}${randomBytes(16).toString("hex")}`;
  // If this org has no OWNER yet, the default admin becomes its OWNER — an
  // ownerless workspace shouldn't exist even when first entered via the
  // platform impersonation shortcut (see resolveWorkspaceRole).
  const effectiveRole = await resolveWorkspaceRole(prisma, organizationId, role);
  const created = await prisma.user.create({
    data: {
      email,
      name: defaultNameFor(role),
      passwordHash: sentinelHash,
      role: effectiveRole,
      organizationId,
    },
    select: { id: true, email: true, name: true, role: true },
  });
  if (effectiveRole === Role.OWNER) {
    await prisma.organization.updateMany({
      where: { id: organizationId, ownerUserId: null },
      data: { ownerUserId: created.id },
    });
  }
  return created;
}
