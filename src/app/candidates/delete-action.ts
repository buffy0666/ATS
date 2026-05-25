"use server";

import { revalidatePath } from "next/cache";
import { CustomFieldEntity } from "@/generated/prisma";
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
  const result = await prisma.candidate.deleteMany({
    where: { id: candidateId, organizationId: orgId },
  });
  if (result.count > 0) {
    await deleteCustomFieldValuesFor(CustomFieldEntity.CANDIDATE, candidateId, orgId);
  }
  revalidatePath("/candidates");
}
