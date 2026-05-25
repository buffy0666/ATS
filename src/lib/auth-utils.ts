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

/**
 * Gate for /platform/* routes — the SaaS operator's cross-tenant view.
 * Distinct from `requireAdmin()` which gates per-tenant ADMIN role. A
 * platform admin is the person running the SaaS itself, not a customer.
 *
 * Behavior:
 *   - Unauthenticated → /login.
 *   - Authenticated but not isPlatformAdmin → /?error=forbidden (same
 *     bounce as requireAdmin to avoid leaking which routes exist).
 *
 * Bootstrapping: the PLATFORM_ADMIN_EMAILS env var auto-promotes matching
 * emails on every sign-in (see auth.ts), so you can grant access by
 * editing Vercel env without DB access.
 */
export async function requirePlatformAdmin() {
  const session = await requireSession();
  if (!session.user.isPlatformAdmin) {
    redirect("/?error=forbidden");
  }
  return session;
}
