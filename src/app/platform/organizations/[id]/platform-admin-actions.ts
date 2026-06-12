"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/auth-utils";

export type PromoteResult = { ok: true } | { ok: false; error: string };

/**
 * Promote a tenant user to workspace OWNER, or demote an OWNER back to
 * ADMIN. Used from the platform org detail page.
 *
 * Deliberately does NOT touch isPlatformAdmin: Platform Owner status is
 * not grantable from this page. It comes from the operator domain rule
 * (dogfooddev.com / bbagc.com — see src/auth.ts) or the
 * PLATFORM_ADMIN_EMAILS / PLATFORM_ADMIN_DOMAINS env vars.
 *
 * Safety rails:
 *  - Caller must be a platform admin (requirePlatformAdmin).
 *  - Demoting never leaves a workspace with zero OWNERs.
 */
export async function toggleWorkspaceOwnerAction(formData: FormData): Promise<void> {
  await requirePlatformAdmin();

  const targetUserId = String(formData.get("targetUserId") ?? "");
  const desired = formData.get("desired") === "true"; // true = make OWNER
  if (!targetUserId) return;

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, organizationId: true },
  });
  if (!target || !target.organizationId) return;

  const refresh = () =>
    revalidatePath(`/platform/organizations/${target.organizationId}`);

  if (desired) {
    if (target.role !== Role.OWNER) {
      await prisma.user.update({
        where: { id: target.id },
        data: { role: Role.OWNER },
      });
    }
    refresh();
    return;
  }

  if (target.role !== Role.OWNER) {
    refresh();
    return;
  }

  // Never leave the workspace ownerless.
  const owners = await prisma.user.count({
    where: { organizationId: target.organizationId, role: Role.OWNER },
  });
  if (owners <= 1) {
    refresh();
    return;
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { role: Role.ADMIN },
  });
  refresh();
}
