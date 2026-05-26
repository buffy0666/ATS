import { NextRequest, NextResponse } from "next/server";
import { Role } from "@/generated/prisma";
import { auth, updateSession } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth-utils";
import { startImpersonation } from "@/lib/impersonation";

/**
 * Quick-impersonate-by-role route. Reached via:
 *   /platform/impersonate-as?orgId=<id>&role=ADMIN
 *   /platform/impersonate-as?orgId=<id>&role=RECRUITER
 *
 * Picks the first active non-platform-admin user with the requested role
 * in that org, starts an impersonation session, and redirects to "/" so
 * the new tab lands on the tenant's dashboard already wearing the user's
 * identity.
 *
 * Why a GET route handler instead of a server action: server actions are
 * processed via fetch in the current document, so <form target="_blank">
 * doesn't open them in a new tab. A plain GET route works with
 * <a target="_blank"> and gets the browser's cookie automatically — so
 * the platform admin's session reaches the handler, updateSession()
 * rewrites the JWT, and the new tab navigates to the impersonated view.
 *
 * Caveat (inherent to cookie-based auth): the JWT cookie is browser-wide,
 * not per-tab. After this request, ALL tabs of the same browser profile
 * are impersonated. The original /platform tab keeps its cached HTML
 * looking like platform-admin until it navigates or refreshes. Click
 * "Exit" in any tab to return everywhere to normal.
 */
export async function GET(request: NextRequest) {
  const platformAdmin = await requirePlatformAdmin();

  // Refuse nested impersonation. If they're already wearing a tenant
  // hat, starting another would clobber the audit chain.
  const currentSession = await auth();
  if (currentSession?.impersonation) {
    return NextResponse.redirect(
      new URL("/platform/organizations?error=already-impersonating", request.url),
    );
  }

  const orgId = request.nextUrl.searchParams.get("orgId");
  const roleParam = request.nextUrl.searchParams.get("role");

  if (!orgId || !roleParam) {
    return NextResponse.redirect(
      new URL("/platform/organizations?error=missing-params", request.url),
    );
  }
  if (!Object.values(Role).includes(roleParam as Role)) {
    return NextResponse.redirect(
      new URL("/platform/organizations?error=invalid-role", request.url),
    );
  }

  // Find first active non-platform-admin user with the role. Oldest
  // first — typically the org owner / founding admin for ADMIN, and
  // the first hired recruiter for RECRUITER.
  const target = await prisma.user.findFirst({
    where: {
      organizationId: orgId,
      active: true,
      isPlatformAdmin: false,
      role: roleParam as Role,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!target) {
    const label = roleParam === Role.ADMIN ? "admin" : "recruiter";
    return NextResponse.redirect(
      new URL(
        `/platform/organizations/${orgId}?error=${encodeURIComponent(
          `No active ${label} in that org to sign in as.`,
        )}`,
        request.url,
      ),
    );
  }

  const result = await startImpersonation({
    platformAdminUserId: platformAdmin.user.id,
    targetUserId: target.id,
  });

  if (!result.ok) {
    return NextResponse.redirect(
      new URL(
        `/platform/organizations/${orgId}?error=${encodeURIComponent(result.error)}`,
        request.url,
      ),
    );
  }

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
  return NextResponse.redirect(new URL("/", request.url));
}
