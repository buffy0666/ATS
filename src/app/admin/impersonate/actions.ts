"use server";

import { redirect } from "next/navigation";
import { auth, updateSession } from "@/auth";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startImpersonation } from "@/lib/impersonation";

/**
 * Begin impersonating a user inside the caller's own organization.
 * Distinct from the platform-admin path (which can cross tenants) —
 * this one is scoped to the admin's own tenant and gated on ADMIN/OWNER
 * within that org. Reuses the same ImpersonationSession + JWT overlay
 * machinery; the column's legacy name is `platformAdminUserId` but it's
 * just "who is impersonating" — works for any actor.
 *
 * Refuses to nest impersonation, cross orgs, target a platform admin,
 * or target the caller themselves.
 */
export async function startAdminImpersonation(formData: FormData): Promise<void> {
  const { session: adminSession, orgId } = await requireAdminWithOrg();
  const current = await auth();

  if (current?.impersonation) {
    redirect("/admin/impersonate?error=already-impersonating");
  }

  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!targetUserId) {
    redirect("/admin/impersonate?error=missing-target");
  }

  // Target must be in the SAME org. We confirm here (rather than relying
  // on startImpersonation alone) because the lib path is also used by
  // platform admins and doesn't enforce tenant boundaries on its own.
  const target = await prisma.user.findFirst({
    where: { id: targetUserId, organizationId: orgId },
    select: { id: true, isPlatformAdmin: true },
  });
  if (!target) {
    redirect("/admin/impersonate?error=not-in-your-org");
  }
  if (target.isPlatformAdmin) {
    redirect("/admin/impersonate?error=cant-impersonate-platform-admin");
  }
  if (target.id === adminSession.user.id) {
    redirect("/admin/impersonate?error=cant-impersonate-self");
  }

  const result = await startImpersonation({
    platformAdminUserId: adminSession.user.id,
    targetUserId,
    reason,
  });
  if (!result.ok) {
    redirect(`/admin/impersonate?error=${encodeURIComponent(result.error)}`);
  }

  const targetName = await prisma.user
    .findUnique({ where: { id: result.session.targetUserId }, select: { name: true } })
    .then((u) => u?.name ?? null);

  await updateSession({
    impersonation: {
      sessionId: result.session.id,
      targetUserId: result.session.targetUserId,
      targetEmail: result.session.targetEmail,
      targetName,
      targetRole: result.session.targetRole as never,
      targetOrgId: result.session.targetOrgId,
      targetOrgName: result.session.targetOrgName,
      realUserId: adminSession.user.id,
      realEmail: adminSession.user.email,
    },
  });

  // Land on the dashboard with the new identity active so the admin
  // sees exactly what the impersonated user sees.
  redirect("/");
}
