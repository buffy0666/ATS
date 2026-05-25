"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth-utils";

export type PromoteResult = { ok: true } | { ok: false; error: string };

/**
 * Flip a user's isPlatformAdmin flag. Used from the platform org detail
 * page to grow / shrink the SaaS operator team.
 *
 * Safety rails:
 *  - Caller must already be a platform admin (requirePlatformAdmin).
 *  - You can't demote yourself — must be done by a different platform
 *    admin or by editing PLATFORM_ADMIN_EMAILS env var. Prevents you
 *    from accidentally cutting your own access mid-session.
 *  - You can't demote the last remaining platform admin via UI. There
 *    has to be at least one left. (Env var auto-promotion is still the
 *    recovery path if this somehow fires.)
 *  - The user must sign out + back in for the JWT to refresh with the
 *    new flag. We surface this in the UI message.
 */
export async function togglePlatformAdminAction(formData: FormData): Promise<void> {
  const session = await requirePlatformAdmin();

  const targetUserId = String(formData.get("targetUserId") ?? "");
  const desired = formData.get("desired") === "true";
  if (!targetUserId) return;

  if (targetUserId === session.user.id && !desired) {
    // Don't demote yourself — too easy to lock yourself out of /platform
    // mid-session. Force a different platform admin to do it, or the
    // env-var path.
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      isPlatformAdmin: true,
      organizationId: true,
    },
  });
  if (!target) return;
  // No-op if it's already at the desired state.
  if (target.isPlatformAdmin === desired) {
    if (target.organizationId) {
      revalidatePath(`/platform/organizations/${target.organizationId}`);
    }
    return;
  }

  // Don't strip the last platform admin via this UI — leaves no way
  // back in (other than env var, which we want to keep as a recovery
  // mechanism not the only path).
  if (!desired) {
    const remaining = await prisma.user.count({
      where: { isPlatformAdmin: true, id: { not: targetUserId } },
    });
    if (remaining === 0) return;
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: { isPlatformAdmin: desired },
  });

  if (target.organizationId) {
    revalidatePath(`/platform/organizations/${target.organizationId}`);
  }
}
