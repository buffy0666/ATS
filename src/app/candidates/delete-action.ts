"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * Hard-delete a candidate. Applications cascade-delete (and their notes/emails).
 * EmailLog rows that referenced this candidate keep the row but null the
 * candidateId — historical send records aren't lost.
 */
export async function deleteCandidate(candidateId: string) {
  await requireSession();
  await prisma.candidate.delete({ where: { id: candidateId } });
  revalidatePath("/candidates");
}
