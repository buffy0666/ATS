import { type NextRequest } from "next/server";
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
 * in that org (or auto-provisions a Default Admin / Default User if none
 * exists). Starts an impersonation session and redirects to "/".
 *
 * THIS IS A ROUTE HANDLER FOR A REASON. Earlier attempts:
 *   - Server Component page: throws "Cookies can only be modified in a
 *     Server Action or Route Handler" because updateSession calls
 *     cookies().set() during render, which the framework forbids.
 *   - Route Handler with NextResponse.redirect: the explicit Response
 *     object doesn't carry the cookies that updateSession set.
 * The working combination is Route Handler + redirect() from
 * next/navigation. redirect() throws NEXT_REDIRECT, which Next.js's
 * Route Handler runtime catches and converts to a 307 response that
 * INCLUDES any Set-Cookie headers buffered during the request.
 */
export async function GET(request: NextRequest) {
  const platformAdmin = await requirePlatformAdmin();

  // Refuse nested impersonation.
  const currentSession = await auth();
  if (currentSession?.impersonation) {
    redirect("/platform/organizations?error=already-impersonating");
  }

  const orgId = request.nextUrl.searchParams.get("orgId");
  const roleParam = request.nextUrl.searchParams.get("role");

  if (!orgId || !roleParam) {
    redirect("/platform/organizations?error=missing-params");
  }
  if (!Object.values(Role).includes(roleParam as Role)) {
    redirect("/platform/organizations?error=invalid-role");
  }

  // First try: a real active user with the role.
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

  // Fallback: auto-provision a Default Admin / Default User in the org.
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

  // Push the impersonation overlay into the JWT. updateSession() calls
  // cookies().set() under the hood. The redirect() call below throws
  // NEXT_REDIRECT, which the Route Handler runtime catches AFTER the
  // request finishes its body — so the cookies are still buffered and
  // included in the redirect response. This is the only combination
  // that actually works for "open in a new tab with new session".
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

  redirect("/");
}
