"use server";

import { signOut } from "@/auth";
import { requireOwnerWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Permanently delete the current owner's workspace (tenant).
 *
 * This is the single most destructive action in the product: deleting the
 * Organization row cascades through every org-scoped relation — candidates,
 * jobs, clients, applications, interviews, notes, AND every user account in
 * the workspace (User.organization is onDelete: Cascade). There is no undo
 * and no soft-delete; the data is gone.
 *
 * Guards (defense in depth):
 *   1. requireOwnerWithOrg — only the OWNER role reaches this action; ADMIN
 *      and RECRUITER are redirected. The Danger-zone page is owner-gated too,
 *      but a forged POST shouldn't get further than this.
 *   2. Type-to-confirm — the caller must type the workspace's exact name. We
 *      re-check it server-side against the DB (never trust the client), so a
 *      stale/forged form can't fire the delete.
 *
 * On success there is no normal return: the acting owner's own user row is
 * part of the cascade, so we end their session and redirect to /login.
 */

export type DeleteWorkspaceResult = { ok: false; error: string };

export async function deleteWorkspace(
  _prev: DeleteWorkspaceResult | undefined,
  formData: FormData,
): Promise<DeleteWorkspaceResult> {
  const { orgId } = await requireOwnerWithOrg();

  const confirmName = (formData.get("confirmName") ?? "").toString();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) {
    return { ok: false, error: "Workspace not found." };
  }

  // Exact (trimmed) match required — the whole point of the type-to-confirm
  // is that an accidental click can't proceed.
  if (confirmName.trim() !== org.name.trim()) {
    return {
      ok: false,
      error: `That doesn't match. Type the workspace name exactly: "${org.name}".`,
    };
  }

  // Irreversible. Cascade wipes every org-scoped record.
  await prisma.organization.delete({ where: { id: org.id } });

  // The owner's user row was just cascade-deleted; their JWT now points at a
  // user that no longer exists. signOut() clears the session and throws a
  // redirect to /login — so nothing below runs.
  await signOut({ redirectTo: "/login?workspace_deleted=1" });
  // Unreachable — signOut throws.
  return { ok: false, error: "" };
}
