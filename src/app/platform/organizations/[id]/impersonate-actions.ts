"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth, updateSession } from "@/auth";
import { requirePlatformAdmin } from "@/lib/auth-utils";
import {
  endImpersonation,
  startImpersonation,
} from "@/lib/impersonation";

/**
 * Begin impersonating a tenant user. Requires platform-admin AND that the
 * caller is not currently already impersonating someone (no nested
 * impersonation — they need to exit the current one first).
 *
 * Side effects:
 *   - Creates an ImpersonationSession audit row
 *   - Pushes the overlay into the JWT via updateSession()
 *   - Redirects to / so the impersonator lands on the tenant's dashboard
 *     with the new identity active immediately
 */
export async function startImpersonationAction(formData: FormData): Promise<void> {
  const platformAdminSession = await requirePlatformAdmin();
  const currentSession = await auth();

  // Refuse nested impersonation. If they're already wearing a tenant
  // hat, the JWT.impersonation overlay is already set; starting a new
  // one would clobber the audit chain.
  if (currentSession?.impersonation) {
    redirect("/platform/organizations?error=already-impersonating");
  }

  const targetUserId = String(formData.get("targetUserId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!targetUserId) {
    redirect("/platform/organizations?error=missing-target");
  }

  const result = await startImpersonation({
    platformAdminUserId: platformAdminSession.user.id,
    targetUserId,
    reason,
  });
  if (!result.ok) {
    redirect(
      `/platform/organizations?error=${encodeURIComponent(result.error)}`,
    );
  }

  // Look up target name once so the banner doesn't need a DB call.
  const target = await prisma.user.findUnique({
    where: { id: result.session.targetUserId },
    select: { name: true },
  });

  await updateSession({
    impersonation: {
      sessionId: result.session.id,
      targetUserId: result.session.targetUserId,
      targetEmail: result.session.targetEmail,
      targetName: target?.name ?? null,
      targetRole: result.session.targetRole as never,
      targetOrgId: result.session.targetOrgId,
      targetOrgName: result.session.targetOrgName,
      realUserId: platformAdminSession.user.id,
      realEmail: platformAdminSession.user.email,
    },
  });

  // Land on the tenant's dashboard with the new identity. They'll see
  // exactly what the impersonated user sees.
  redirect("/");
}

/**
 * Exit impersonation. Called from the banner's "Exit" button. Marks the
 * audit row's endedAt, clears the JWT overlay, sends them back to the
 * platform org detail page so they can either re-impersonate or move on.
 */
export async function endImpersonationAction(): Promise<void> {
  const session = await auth();
  const impersonation = session?.impersonation;
  if (!impersonation) {
    // Nothing to do — they're not impersonating. Bounce home.
    redirect("/");
  }

  await endImpersonation({
    sessionId: impersonation.sessionId,
    platformAdminUserId: impersonation.realUserId,
  });

  // Pass null to signal "clear the overlay" — JWT callback handles this
  // by deleting the token.impersonation field. TS sees `null` as wider
  // than the Session type allows, so cast to keep the runtime contract
  // explicit.
  await updateSession({ impersonation: null } as unknown as Parameters<
    typeof updateSession
  >[0]);

  redirect(`/platform/organizations/${impersonation.targetOrgId}`);
}
