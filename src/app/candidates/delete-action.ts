"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CustomFieldEntity } from "@/generated/prisma";
import { auditDelete } from "@/lib/audit/write";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { deleteCustomFieldValuesFor } from "@/lib/custom-fields";
import { prisma } from "@/lib/prisma";

/**
 * Hard-delete a candidate. Applications cascade-delete (and their notes/emails).
 * EmailLog rows that referenced this candidate keep the row but null the
 * candidateId — historical send records aren't lost.
 *
 * Multi-tenant: scoped via deleteMany on (id + organizationId) so a guessed
 * id from another tenant can't delete someone else's candidate.
 */
export async function deleteCandidate(candidateId: string) {
  const { orgId } = await requireSessionWithOrg();
  // Read first so the audit row captures the deleted candidate's identity
  // (label, key fields) — once the row is gone we can't reconstruct it.
  const before = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
  });
  const result = await prisma.candidate.deleteMany({
    where: { id: candidateId, organizationId: orgId },
  });
  if (result.count > 0) {
    await deleteCustomFieldValuesFor(CustomFieldEntity.CANDIDATE, candidateId, orgId);
    if (before) await auditDelete("Candidate", before as unknown as Record<string, unknown>);
  }
  revalidatePath("/candidates");
  // Send the user back to the list — if they triggered this from the detail
  // page, the candidate they were looking at is gone. From the list this is
  // a same-URL redirect, which just re-renders with the row removed.
  redirect("/candidates");
}
