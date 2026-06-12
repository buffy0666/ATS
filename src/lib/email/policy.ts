import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Per-workspace email kill switch (Organization.emailOutDisabled).
 *
 * Enforced at the send chokepoints (sendEmail / sendFromUserMailbox) so a
 * disabled workspace can't send outbound candidate/contact mail through any
 * path. It's scoped to a single org, so toggling it never affects other
 * tenants. Internal transactional mail that has no org context (e.g. teammate
 * invitations) is not gated.
 */

export class EmailOutDisabledError extends Error {
  constructor(message = "Email sending is disabled for this workspace.") {
    super(message);
    this.name = "EmailOutDisabledError";
  }
}

/** Throws EmailOutDisabledError if the org's email kill switch is on. No-op when orgId is absent. */
export async function assertEmailOutEnabled(orgId: string | null | undefined): Promise<void> {
  if (!orgId) return;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { emailOutDisabled: true },
  });
  if (org?.emailOutDisabled) throw new EmailOutDisabledError();
}

/** Cheap read for UIs that want to show/branch on the switch. */
export async function isEmailOutDisabled(orgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { emailOutDisabled: true },
  });
  return Boolean(org?.emailOutDisabled);
}
