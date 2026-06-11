"use server";

import { revalidatePath } from "next/cache";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tagColorForName } from "@/lib/tag-colors";

export type TagActionResult =
  | { ok: true; tag?: { id: string; name: string; color: string } }
  | { ok: false; error: string };

async function requireOrgCandidate(candidateId: string) {
  const { orgId } = await requireSessionWithOrg();
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true },
  });
  return { orgId, candidate };
}

/**
 * Attach a tag to a candidate by name — reuses an existing tag or creates a
 * new one on the fly (same upsert-by-name model as the bulk "Add tag…"
 * action; Phase 6 swaps the key to (organizationId, name)).
 */
export async function addTagToCandidate(
  candidateId: string,
  rawName: string,
): Promise<TagActionResult> {
  const name = rawName.trim();
  if (!name || name.length > 60) {
    return { ok: false, error: "Tag name must be 1–60 characters." };
  }

  const { orgId, candidate } = await requireOrgCandidate(candidateId);
  if (!candidate) return { ok: false, error: "Candidate not found." };

  const tag = await prisma.tag.upsert({
    where: { name },
    create: { name, color: tagColorForName(name), organizationId: orgId },
    update: {},
    select: { id: true, name: true, color: true },
  });

  await prisma.candidate.update({
    where: { id: candidateId },
    data: { tags: { connect: { id: tag.id } } },
  });

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true, tag };
}

/** Detach a tag from a candidate. The tag itself is kept for reuse. */
export async function removeTagFromCandidate(
  candidateId: string,
  tagId: string,
): Promise<TagActionResult> {
  const { candidate } = await requireOrgCandidate(candidateId);
  if (!candidate) return { ok: false, error: "Candidate not found." };

  await prisma.candidate.update({
    where: { id: candidateId },
    data: { tags: { disconnect: { id: tagId } } },
  });

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}
