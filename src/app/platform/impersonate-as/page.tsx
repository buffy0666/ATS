import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma";
import { auth, updateSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth-utils";
import { startImpersonation } from "@/lib/impersonation";
import { findOrCreateDefaultUser } from "@/lib/platform-default-users";

/**
 * Quick-impersonate-by-role entry point. Reached via:
 *   /platform/impersonate-as?orgId=<id>&role=ADMIN
 *   /platform/impersonate-as?orgId=<id>&role=RECRUITER
 *
 * Picks the first active non-platform-admin user with the requested role
 * in that org, starts an impersonation session, and redirects to "/" so
 * the new tab lands on the tenant's dashboard already wearing the user's
 * identity.
 *
 * Why a Server Component page instead of a Route Handler: NextAuth's
 * updateSession() writes the new JWT via cookies().set(). When a Route
 * Handler returns NextResponse.redirect, that response is constructed
 * directly and doesn't carry the cookie mutation through — so the new
 * tab would load with the OLD (platform-admin) session and no
 * impersonation overlay. A Server Component page invokes redirect() from
 * next/navigation, which throws an exception that Next.js intercepts and
 * turns into a redirect response WITH any cookies set during render.
 * That's the path updateSession is designed for.
 *
 * This component never actually renders — every code path ends in
 * redirect(), which throws a NEXT_REDIRECT control-flow exception.
 */
export default async function ImpersonateAsPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string; role?: string }>;
}) {
  const platformAdmin = await requirePlatformAdmin();

  // Refuse nested impersonation. If they're already wearing a tenant
  // hat, starting another would clobber the audit chain.
  const currentSession = await auth();
  if (currentSession?.impersonation) {
    redirect("/platform/organizations?error=already-impersonating");
  }

  const { orgId, role: roleParam } = await searchParams;

  if (!orgId || !roleParam) {
    redirect("/platform/organizations?error=missing-params");
  }
  if (!Object.values(Role).includes(roleParam as Role)) {
    redirect("/platform/organizations?error=invalid-role");
  }

  // Find first active non-platform-admin user with the role. Oldest
  // first — typically the org owner / founding admin for ADMIN, and the
  // first hired recruiter for RECRUITER.
  let target: { id: string; name: string | null } | null =
    await prisma.user.findFirst({
      where: {
        organizationId: orgId,
        active: true,
        isPlatformAdmin: false,
        role: roleParam as Role,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });

  // Fallback: no real user of this role yet (e.g. a brand-new tenant has
  // only the founding ADMIN, so clicking "User" finds zero recruiters).
  // Find-or-create a synthetic Default Admin / Default User in that org
  // so the platform admin can always log in — useful for QA, demos, and
  // poking around an empty workspace.
  if (!target) {
    const fallback = await findOrCreateDefaultUser(orgId, roleParam as Role);
    if (!fallback) {
      redirect(
        `/platform/organizations/${orgId}?error=${encodeURIComponent(
          "Could not provision a default user for that org.",
        )}`,
      );
    }
    target = { id: fallback.id, name: fallback.name };
  }

  const result = await startImpersonation({
    platformAdminUserId: platformAdmin.user.id,
    targetUserId: target.id,
  });

  if (!result.ok) {
    redirect(
      `/platform/organizations/${orgId}?error=${encodeURIComponent(result.error)}`,
    );
  }

  // Push the overlay into the JWT. Because we're in a Server Component
  // page (not a Route Handler), Next.js will propagate the cookie write
  // through the redirect response that follows.
  await updateSession({
    impersonation: {
      sessionId: result.session.id,
      targetUserId: result.session.targetUserId,
      targetEmail: result.session.targetEmail,
      targetName: target.name,
      targetRole: result.session.targetRole as Role,
      targetOrgId: result.session.targetOrgId,
      targetOrgName: result.session.targetOrgName,
      realUserId: platformAdmin.user.id,
      realEmail: platformAdmin.user.email,
    },
  });

  // Land on the tenant's dashboard with the new identity active. The
  // impersonation banner renders across the top of every page.
  redirect("/");
}
