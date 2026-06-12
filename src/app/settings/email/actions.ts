"use server";

import { revalidatePath } from "next/cache";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export type SetEmailOutResult =
  | { ok: true; disabled: boolean }
  | { ok: false; error: string };

/**
 * Toggle the per-workspace email kill switch (Organization.emailOutDisabled).
 * Admin+ only, scoped to the caller's org, so it never affects other tenants.
 */
export async function setEmailOutDisabled(disabled: boolean): Promise<SetEmailOutResult> {
  const { orgId } = await requireAdminWithOrg();
  try {
    await prisma.organization.update({
      where: { id: orgId },
      data: { emailOutDisabled: disabled },
    });
  } catch {
    return { ok: false, error: "Could not update the email setting. Try again." };
  }
  revalidatePath("/settings/email");
  return { ok: true, disabled };
}
