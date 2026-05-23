"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tagColorForName } from "@/lib/tag-colors";
import { Stage } from "@/generated/prisma";

const MAX_BULK = 500;

function sanitizeIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      ids.filter((id) => typeof id === "string" && id.length > 0 && id.length < 40),
    ),
  ).slice(0, MAX_BULK);
}

export type BulkActionResult = {
  ok: boolean;
  message: string;
  affected: number;
  alreadyPresent?: number;
};

export async function addCandidatesToList(
  candidateIds: string[],
  listId: string,
): Promise<BulkActionResult> {
  const session = await requireSession();
  const ids = sanitizeIds(candidateIds);
  if (ids.length === 0 || !listId) {
    return { ok: false, message: "Pick at least one candidate and a list.", affected: 0 };
  }

  const list = await prisma.candidateList.findUnique({
    where: { id: listId },
    select: { id: true, name: true, scope: true, ownerId: true },
  });
  if (!list) return { ok: false, message: "List not found.", affected: 0 };
  if (list.scope === "PERSONAL" && list.ownerId !== session.user.id) {
    return { ok: false, message: "You can't add to someone else's personal list.", affected: 0 };
  }

  const result = await prisma.candidateListMember.createMany({
    data: ids.map((candidateId) => ({
      listId,
      candidateId,
      addedById: session.user.id ?? null,
    })),
    skipDuplicates: true,
  });

  revalidatePath("/candidates");
  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");

  const alreadyPresent = ids.length - result.count;
  return {
    ok: true,
    message:
      alreadyPresent > 0
        ? `Added ${result.count} to "${list.name}" (${alreadyPresent} already on the list).`
        : `Added ${result.count} candidate${result.count === 1 ? "" : "s"} to "${list.name}".`,
    affected: result.count,
    alreadyPresent,
  };
}

export async function addCandidatesToJob(
  candidateIds: string[],
  jobId: string,
): Promise<BulkActionResult> {
  await requireSession();
  const ids = sanitizeIds(candidateIds);
  if (ids.length === 0 || !jobId) {
    return { ok: false, message: "Pick at least one candidate and a job.", affected: 0 };
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, title: true },
  });
  if (!job) return { ok: false, message: "Job not found.", affected: 0 };

  // Find existing applications so we can report how many were already attached.
  const existing = await prisma.application.findMany({
    where: { jobId, candidateId: { in: ids } },
    select: { candidateId: true },
  });
  const existingSet = new Set(existing.map((a) => a.candidateId));
  const toCreate = ids.filter((id) => !existingSet.has(id));

  // `createMany` would be one roundtrip, but applications have a compound
  // unique on (jobId, candidateId) and we want to be safe under races.
  if (toCreate.length > 0) {
    await prisma.application.createMany({
      data: toCreate.map((candidateId) => ({
        jobId,
        candidateId,
        stage: Stage.APPLIED,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidates");

  const created = toCreate.length;
  const already = ids.length - created;
  return {
    ok: true,
    message:
      already > 0
        ? `Added ${created} candidate${created === 1 ? "" : "s"} to "${job.title}" (${already} already applied).`
        : `Added ${created} candidate${created === 1 ? "" : "s"} to "${job.title}".`,
    affected: created,
    alreadyPresent: already,
  };
}

export async function addTagsToCandidates(
  candidateIds: string[],
  tagNames: string[],
): Promise<BulkActionResult> {
  await requireSession();
  const ids = sanitizeIds(candidateIds);
  const names = Array.from(
    new Set(tagNames.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 60)),
  );
  if (ids.length === 0 || names.length === 0) {
    return { ok: false, message: "Pick at least one candidate and one tag.", affected: 0 };
  }

  // Upsert each tag to get IDs, then connect to each candidate.
  // (Prisma doesn't support bulk M2M connect via updateMany.)
  const tags = await Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { name },
        create: { name, color: tagColorForName(name) },
        update: {},
        select: { id: true },
      }),
    ),
  );
  const tagConnect = tags.map((t) => ({ id: t.id }));

  await prisma.$transaction(
    ids.map((id) =>
      prisma.candidate.update({
        where: { id },
        data: { tags: { connect: tagConnect } },
      }),
    ),
  );

  revalidatePath("/candidates");

  return {
    ok: true,
    message: `Tagged ${ids.length} candidate${ids.length === 1 ? "" : "s"} with ${names.length} tag${names.length === 1 ? "" : "s"}.`,
    affected: ids.length,
  };
}

export async function removeCandidatesFromList(
  candidateIds: string[],
  listId: string,
): Promise<BulkActionResult> {
  const session = await requireSession();
  const ids = sanitizeIds(candidateIds);
  if (ids.length === 0 || !listId) {
    return { ok: false, message: "Pick at least one candidate.", affected: 0 };
  }

  const list = await prisma.candidateList.findUnique({
    where: { id: listId },
    select: { id: true, name: true, scope: true, ownerId: true },
  });
  if (!list) return { ok: false, message: "List not found.", affected: 0 };
  if (list.scope === "PERSONAL" && list.ownerId !== session.user.id) {
    return { ok: false, message: "You can't change someone else's personal list.", affected: 0 };
  }

  const result = await prisma.candidateListMember.deleteMany({
    where: { listId, candidateId: { in: ids } },
  });

  revalidatePath(`/lists/${listId}`);
  revalidatePath("/lists");

  return {
    ok: true,
    message: `Removed ${result.count} candidate${result.count === 1 ? "" : "s"} from "${list.name}".`,
    affected: result.count,
  };
}

/** Lookup helpers for the toolbar pickers. */
export async function listsVisibleToCurrentUser(): Promise<
  { id: string; name: string; scope: "PERSONAL" | "SHARED"; ownerId: string }[]
> {
  const session = await requireSession();
  const lists = await prisma.candidateList.findMany({
    where: {
      OR: [{ ownerId: session.user.id }, { scope: "SHARED" }],
    },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, scope: true, ownerId: true },
  });
  return lists;
}

export async function createListForBulk(
  name: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const session = await requireSession();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  if (trimmed.length > 120) return { error: "Name is too long (max 120 chars)." };

  const list = await prisma.candidateList.create({
    data: {
      name: trimmed,
      ownerId: session.user.id,
      scope: "PERSONAL",
    },
    select: { id: true, name: true },
  });
  revalidatePath("/lists");
  return list;
}

export async function openJobsForBulk(): Promise<{ id: string; title: string }[]> {
  await requireSession();
  return prisma.job.findMany({
    where: { status: "OPEN" },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
    take: 200,
  });
}

export async function activeSequencesForBulk(): Promise<{ id: string; name: string }[]> {
  await requireSession();
  return prisma.sequence.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 200,
  });
}
