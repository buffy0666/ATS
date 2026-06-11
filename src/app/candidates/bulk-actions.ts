"use server";

import { revalidatePath } from "next/cache";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tagColorForName } from "@/lib/tag-colors";
import { Prisma, Stage } from "@/generated/prisma";
import { ensureChoiceDefaults, loadChoiceOptions, CHOICE_FIELDS } from "@/lib/choices";
import {
  getBulkEditField,
  SENIORITY_CHOICE_FIELD,
  SOURCE_CHOICE_FIELD,
  type BulkEditFieldDef,
} from "./bulk-edit-fields";

const MAX_BULK = 500;

/**
 * Strip out invalid cuids AND cap to MAX_BULK. Every bulk action also
 * intersects the resulting list with rows that belong to the caller's org
 * — anything outside is silently dropped (rather than throwing) so the
 * remaining valid rows still get processed.
 */
function sanitizeIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      ids.filter((id) => typeof id === "string" && id.length > 0 && id.length < 40),
    ),
  ).slice(0, MAX_BULK);
}

/**
 * Filter a list of candidate ids to just those that belong to the given
 * org. Used by every bulk action to prevent cross-tenant writes when the
 * client smuggles ids from another org.
 */
async function filterCandidateIdsToOrg(
  ids: string[],
  orgId: string,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.candidate.findMany({
    where: { id: { in: ids }, organizationId: orgId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
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
  const { session, orgId } = await requireSessionWithOrg();
  const rawIds = sanitizeIds(candidateIds);
  if (rawIds.length === 0 || !listId) {
    return { ok: false, message: "Pick at least one candidate and a list.", affected: 0 };
  }

  const list = await prisma.candidateList.findFirst({
    where: { id: listId, organizationId: orgId },
    select: { id: true, name: true, scope: true, ownerId: true },
  });
  if (!list) return { ok: false, message: "List not found.", affected: 0 };
  if (list.scope === "PERSONAL" && list.ownerId !== session.user.id) {
    return { ok: false, message: "You can't add to someone else's personal list.", affected: 0 };
  }

  const ids = await filterCandidateIdsToOrg(rawIds, orgId);

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
  const { orgId } = await requireSessionWithOrg();
  const rawIds = sanitizeIds(candidateIds);
  if (rawIds.length === 0 || !jobId) {
    return { ok: false, message: "Pick at least one candidate and a job.", affected: 0 };
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, organizationId: orgId },
    select: { id: true, title: true },
  });
  if (!job) return { ok: false, message: "Job not found.", affected: 0 };

  const ids = await filterCandidateIdsToOrg(rawIds, orgId);

  // Find existing applications so we can report how many were already attached.
  const existing = await prisma.application.findMany({
    where: { jobId, candidateId: { in: ids }, organizationId: orgId },
    select: { candidateId: true },
  });
  const existingSet = new Set(existing.map((a) => a.candidateId));
  const toCreate = ids.filter((id) => !existingSet.has(id));

  if (toCreate.length > 0) {
    await prisma.application.createMany({
      data: toCreate.map((candidateId) => ({
        jobId,
        candidateId,
        stage: Stage.APPLIED,
        organizationId: orgId,
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
  const { orgId } = await requireSessionWithOrg();
  const rawIds = sanitizeIds(candidateIds);
  const names = Array.from(
    new Set(tagNames.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 60)),
  );
  if (rawIds.length === 0 || names.length === 0) {
    return { ok: false, message: "Pick at least one candidate and one tag.", affected: 0 };
  }

  const ids = await filterCandidateIdsToOrg(rawIds, orgId);

  // Upsert each tag to get IDs, then connect to each candidate. The
  // upsert key is still the global Tag.name during Phase 1-5; Phase 6
  // swaps this to a compound (organizationId, name) key.
  const tags = await Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { name },
        create: { name, color: tagColorForName(name), organizationId: orgId },
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

/**
 * Detach tags from many candidates at once — the inverse of
 * addTagsToCandidates. Disconnecting a tag a candidate doesn't have is a
 * no-op, so the action is safe to run across a mixed selection. Tags
 * themselves are kept for reuse.
 */
export async function removeTagsFromCandidates(
  candidateIds: string[],
  tagIds: string[],
): Promise<BulkActionResult> {
  const { orgId } = await requireSessionWithOrg();
  const rawIds = sanitizeIds(candidateIds);
  const cleanTagIds = Array.from(
    new Set(tagIds.filter((id) => typeof id === "string" && id.length > 0 && id.length < 40)),
  );
  if (rawIds.length === 0 || cleanTagIds.length === 0) {
    return { ok: false, message: "Pick at least one candidate and one tag.", affected: 0 };
  }

  const ids = await filterCandidateIdsToOrg(rawIds, orgId);
  const tagDisconnect = cleanTagIds.map((id) => ({ id }));

  await prisma.$transaction(
    ids.map((id) =>
      prisma.candidate.update({
        where: { id },
        data: { tags: { disconnect: tagDisconnect } },
      }),
    ),
  );

  revalidatePath("/candidates");

  return {
    ok: true,
    message: `Removed ${cleanTagIds.length} tag${cleanTagIds.length === 1 ? "" : "s"} from ${ids.length} candidate${ids.length === 1 ? "" : "s"}.`,
    affected: ids.length,
  };
}

export async function removeCandidatesFromList(
  candidateIds: string[],
  listId: string,
): Promise<BulkActionResult> {
  const { session, orgId } = await requireSessionWithOrg();
  const ids = sanitizeIds(candidateIds);
  if (ids.length === 0 || !listId) {
    return { ok: false, message: "Pick at least one candidate.", affected: 0 };
  }

  const list = await prisma.candidateList.findFirst({
    where: { id: listId, organizationId: orgId },
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
  const { session, orgId } = await requireSessionWithOrg();
  const lists = await prisma.candidateList.findMany({
    where: {
      organizationId: orgId,
      OR: [{ ownerId: session.user.id }, { scope: "SHARED" }],
    },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, scope: true, ownerId: true },
  });
  return lists;
}

export async function createListForBulk(
  name: string,
  description?: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const { session, orgId } = await requireSessionWithOrg();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Name is required." };
  if (trimmed.length > 120) return { error: "Name is too long (max 120 chars)." };
  const trimmedDescription = description?.trim() ?? "";
  if (trimmedDescription.length > 2000) {
    return { error: "Description is too long (max 2000 chars)." };
  }

  const list = await prisma.candidateList.create({
    data: {
      name: trimmed,
      description: trimmedDescription || null,
      ownerId: session.user.id,
      scope: "PERSONAL",
      organizationId: orgId,
    },
    select: { id: true, name: true },
  });
  revalidatePath("/lists");
  return list;
}

export async function openJobsForBulk(): Promise<{ id: string; title: string }[]> {
  const { orgId } = await requireSessionWithOrg();
  return prisma.job.findMany({
    where: { status: "OPEN", organizationId: orgId },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
    take: 200,
  });
}

export async function activeSequencesForBulk(): Promise<{ id: string; name: string }[]> {
  const { orgId } = await requireSessionWithOrg();
  return prisma.sequence.findMany({
    where: { status: "ACTIVE", organizationId: orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 200,
  });
}

// ----- Bulk "Edit fields" -------------------------------------------------

/**
 * Load the current options for a ChoiceOption-backed field (source / seniority)
 * so the bulk-edit modal can show them. Lazily seeds the per-org defaults the
 * same way /settings/choices does, so a fresh tenant still gets a usable list.
 */
export async function choiceOptionsForBulk(
  choiceField: string,
): Promise<{ id: string; name: string }[]> {
  const { orgId } = await requireSessionWithOrg();
  const known =
    choiceField === SOURCE_CHOICE_FIELD
      ? CHOICE_FIELDS.candidateSource
      : choiceField === SENIORITY_CHOICE_FIELD
        ? CHOICE_FIELDS.candidateSeniority
        : null;
  if (!known) return [];
  await ensureChoiceDefaults(known.key, known.defaults, orgId);
  const rows = await loadChoiceOptions(known.key, orgId);
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Create a new ChoiceOption for source/seniority in the moment (so the user
 * doesn't have to leave the bulk-edit modal to add a missing option). Returns
 * the canonical name to use. Idempotent-ish: if it already exists we just
 * return it rather than erroring.
 */
export async function createChoiceForBulk(
  choiceField: string,
  rawName: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const { orgId } = await requireSessionWithOrg();
  if (choiceField !== SOURCE_CHOICE_FIELD && choiceField !== SENIORITY_CHOICE_FIELD) {
    return { ok: false, error: "Unknown field." };
  }
  const name = rawName.trim();
  if (!name) return { ok: false, error: "Name is required." };
  if (name.length > 80) return { ok: false, error: "Name too long (max 80)." };

  const existing = await prisma.choiceOption.findFirst({
    where: { field: choiceField, name, organizationId: orgId },
    select: { id: true },
  });
  if (existing) return { ok: true, name };

  const max = await prisma.choiceOption.findFirst({
    where: { field: choiceField, organizationId: orgId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  try {
    await prisma.choiceOption.create({
      data: {
        field: choiceField,
        name,
        sortOrder: (max?.sortOrder ?? -1) + 1,
        organizationId: orgId,
      },
    });
  } catch {
    // Pre-Phase-6 the unique index on (field,name) is still global; if another
    // org already owns that name the create throws. The candidate column only
    // stores the string, so we can still use the name regardless.
    return { ok: true, name };
  }
  revalidatePath("/settings/choices");
  return { ok: true, name };
}

/**
 * Coerce the raw string value(s) from the modal into the typed Prisma update
 * payload for a single bulk-edit field. Returns null when the value is invalid
 * for the field (so the action can reject rather than write garbage).
 */
function buildFieldData(
  def: BulkEditFieldDef,
  value: string,
  values: string[],
): Prisma.CandidateUpdateManyMutationInput | null {
  const isClear = value === "" || value === "__CLEAR__";

  switch (def.type) {
    case "enumSelect":
    case "choiceSelect": {
      if (isClear) {
        if (!def.nullable) return null;
        return { [def.key]: null } as Prisma.CandidateUpdateManyMutationInput;
      }
      // enumSelect: value must be one of the known options. choiceSelect: any
      // non-empty string is allowed (it's a free registry, validated upstream).
      if (def.type === "enumSelect" && !def.options?.some((o) => o.value === value)) {
        return null;
      }
      return { [def.key]: value } as Prisma.CandidateUpdateManyMutationInput;
    }
    case "enumMulti": {
      const valid = (def.options ?? []).map((o) => o.value);
      const picked = values.filter((v) => valid.includes(v));
      // Empty selection = clear the array.
      return { [def.key]: { set: picked } } as Prisma.CandidateUpdateManyMutationInput;
    }
    case "rating": {
      if (isClear) return { rating: null };
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 5) return null;
      return { rating: n };
    }
    case "bool": {
      if (value !== "true" && value !== "false") return null;
      return { [def.key]: value === "true" } as Prisma.CandidateUpdateManyMutationInput;
    }
    default:
      return null;
  }
}

/**
 * Apply a single field value to every selected candidate. Org-scoped: the
 * updateMany where-clause includes organizationId, so ids smuggled from
 * another tenant simply don't match and are left untouched.
 */
export async function bulkEditCandidates(
  candidateIds: string[],
  fieldKey: string,
  value: string,
  values: string[] = [],
): Promise<BulkActionResult> {
  const { orgId } = await requireSessionWithOrg();
  const ids = sanitizeIds(candidateIds);
  if (ids.length === 0) {
    return { ok: false, message: "Pick at least one candidate.", affected: 0 };
  }

  const def = getBulkEditField(fieldKey);
  if (!def) return { ok: false, message: "Unknown field.", affected: 0 };

  const data = buildFieldData(def, value, values);
  if (!data) {
    return { ok: false, message: `Invalid value for ${def.label}.`, affected: 0 };
  }

  const result = await prisma.candidate.updateMany({
    where: { id: { in: ids }, organizationId: orgId },
    data,
  });

  revalidatePath("/candidates");

  return {
    ok: true,
    message: `Updated ${def.label} on ${result.count} candidate${result.count === 1 ? "" : "s"}.`,
    affected: result.count,
  };
}
