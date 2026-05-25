import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Role } from "@/generated/prisma";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== Role.ADMIN) {
    redirect("/?error=forbidden");
  }
  return session;
}

/**
 * Multi-tenant variant of `requireSession()`. Use this on any page or
 * server action that reads tenant-scoped data — the returned `orgId` is
 * what gets passed to `where: { organizationId: orgId }` filters in Phase
 * 3 query rewrites.
 *
 * Behavior:
 *   - Unauthenticated user → redirect to /login (same as requireSession).
 *   - Authenticated user with no `organizationId` on their session →
 *     redirect to /onboarding/create-organization, where they create a
 *     new Org and become its owner. (Phase 4 adds that page.) During the
 *     interim the redirect target may 404; the helper still does the
 *     right thing — it's the page that needs to catch up.
 *
 * Returns a non-null `orgId` so callers don't have to narrow the type.
 */
export async function requireSessionWithOrg() {
  const session = await requireSession();
  const orgId = session.user.organizationId;
  if (!orgId) {
    redirect("/onboarding/create-organization");
  }
  return {
    session,
    orgId,
    orgName: session.user.organizationName,
  };
}

/**
 * Same as requireSessionWithOrg() but also enforces ADMIN role. Pages that
 * write tenant configuration (Settings → AI provider, Settings → API
 * tokens, etc.) should use this.
 */
export async function requireAdminWithOrg() {
  const session = await requireAdmin();
  const orgId = session.user.organizationId;
  if (!orgId) {
    redirect("/onboarding/create-organization");
  }
  return {
    session,
    orgId,
    orgName: session.user.organizationName,
  };
}
