import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { setAuditContext } from "@/lib/audit/context";
import { Role } from "@/generated/prisma";

/**
 * Reads the request fingerprint (IP + user agent) from the incoming
 * headers so the audit context can stamp it on every audited write.
 * Best-effort — missing headers just yield null values.
 */
async function captureRequestFingerprint(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    const userAgent = h.get("user-agent") ?? null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Stamp the audit context once at the top of every request — every
  // subsequent Prisma write within this async scope inherits it via
  // AsyncLocalStorage and the audit extension picks it up automatically.
  const { ip, userAgent } = await captureRequestFingerprint();
  setAuditContext({
    actorUserId: session.user.id ?? null,
    actorEmail: session.user.email ?? null,
    organizationId: session.user.organizationId ?? null,
    ip,
    userAgent,
  });
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

/**
 * Hardcoded allowlist of emails permitted to MINT new platform admins via
 * /users/new-global-admin. Separation of duties: an arbitrary platform
 * admin can demote and promote existing users (see togglePlatformAdminAction),
 * but only these humans can create new ones from scratch with a password.
 *
 * The hardcoded list is the source of truth and survives DB problems.
 * GLOBAL_ADMIN_CREATORS env var (comma-separated) can append to it
 * without a code change — useful for adding a new co-founder.
 *
 * Anyone NOT on this list will get a forbidden bounce even if they're a
 * platform admin.
 */
const GLOBAL_ADMIN_CREATOR_EMAILS = new Set(
  [
    "afj@bbagc.com",
    "lyt@bbagc.com",
    "jimenez.evd.a@gmail.com",
    ...(process.env.GLOBAL_ADMIN_CREATORS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ].map((e) => e.toLowerCase()),
);

export function canCreateGlobalAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return GLOBAL_ADMIN_CREATOR_EMAILS.has(email.toLowerCase());
}

/**
 * Server-side guard for the "create global admin" flow. Even an admin
 * with the UI button hidden can't POST to the action — this enforces it.
 */
export async function requireCanCreateGlobalAdmin() {
  const session = await requireSession();
  if (!canCreateGlobalAdmin(session.user.email)) {
    redirect("/?error=forbidden");
  }
  return session;
}
