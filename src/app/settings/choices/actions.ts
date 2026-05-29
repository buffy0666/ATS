"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CHOICE_FIELDS } from "@/lib/choices";

const MAX_NAME = 80;

export type ChoiceActionResult =
  | { ok: true; message: string; affected?: number }
  | { ok: false; message: string };

type FieldHandler = {
  count: (orgId: string, name: string) => Promise<number>;
  rename: (orgId: string, oldName: string, newName: string) => Promise<{ count: number }>;
  nullify: (orgId: string, name: string) => Promise<{ count: number }>;
  invalidate: () => void;
};

// Mutations are scoped by organizationId so renaming "LinkedIn" in one tenant
// can't silently rewrite candidates in another. The ChoiceOption rows
// themselves are also org-scoped (see ChoiceOption.organizationId).
const FIELD_HANDLERS: Record<string, FieldHandler> = {
  [CHOICE_FIELDS.candidateSource.key]: {
    count: (orgId, name) =>
      prisma.candidate.count({ where: { source: name, organizationId: orgId } }),
    rename: (orgId, oldName, newName) =>
      prisma.candidate.updateMany({
        where: { source: oldName, organizationId: orgId },
        data: { source: newName },
      }),
    nullify: (orgId, name) =>
      prisma.candidate.updateMany({
        where: { source: name, organizationId: orgId },
        data: { source: null },
      }),
    invalidate: () => {
      revalidatePath("/candidates");
    },
  },
  [CHOICE_FIELDS.candidateSeniority.key]: {
    count: (orgId, name) =>
      prisma.candidate.count({ where: { seniority: name, organizationId: orgId } }),
    rename: (orgId, oldName, newName) =>
      prisma.candidate.updateMany({
        where: { seniority: oldName, organizationId: orgId },
        data: { seniority: newName },
      }),
    nullify: (orgId, name) =>
      prisma.candidate.updateMany({
        where: { seniority: name, organizationId: orgId },
        data: { seniority: null },
      }),
    invalidate: () => {
      revalidatePath("/candidates");
    },
  },
};

function getHandler(field: string): FieldHandler {
  const h = FIELD_HANDLERS[field];
  if (!h) throw new Error(`Unknown choice field: ${field}`);
  return h;
}

function clean(name: string): string {
  return name.trim();
}

export async function usageCountForChoice(field: string, name: string): Promise<number> {
  const { orgId } = await requireOwnerWithOrg();
  return getHandler(field).count(orgId, name);
}

export async function createChoiceOption(
  field: string,
  rawName: string,
): Promise<ChoiceActionResult> {
  const { orgId } = await requireOwnerWithOrg();
  const name = clean(rawName);
  if (!name) return { ok: false, message: "Name is required." };
  if (name.length > MAX_NAME) return { ok: false, message: `Name too long (max ${MAX_NAME}).` };
  getHandler(field); // validates the field key

  // Place new options at the end of the list (per-org sort).
  const max = await prisma.choiceOption.findFirst({
    where: { field, organizationId: orgId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  // ChoiceOption still has a global @@unique([field, name]) until Phase 6
  // swaps it for [organizationId, field, name]. Until then two orgs can't
  // both name an option "LinkedIn" — that's a known limitation we'll fix
  // in lockdown.
  try {
    await prisma.choiceOption.create({
      data: {
        field,
        name,
        sortOrder: (max?.sortOrder ?? -1) + 1,
        organizationId: orgId,
      },
    });
  } catch {
    return { ok: false, message: `"${name}" already exists for this field.` };
  }
  revalidatePath("/settings/choices");
  return { ok: true, message: `Added "${name}".` };
}

export async function renameChoiceOption(
  optionId: string,
  rawNewName: string,
): Promise<ChoiceActionResult> {
  const { orgId } = await requireOwnerWithOrg();
  const newName = clean(rawNewName);
  if (!newName) return { ok: false, message: "Name is required." };
  if (newName.length > MAX_NAME) return { ok: false, message: `Name too long (max ${MAX_NAME}).` };

  // findFirst (not findUnique by id) so a guessed id from another org
  // can't be renamed via this endpoint.
  const existing = await prisma.choiceOption.findFirst({
    where: { id: optionId, organizationId: orgId },
    select: { field: true, name: true },
  });
  if (!existing) return { ok: false, message: "Option not found." };
  if (existing.name === newName) return { ok: true, message: "No changes.", affected: 0 };

  const handler = getHandler(existing.field);

  // Block duplicate name within the same field. Until Phase 6 the unique
  // index is global; we still check it explicitly so the user gets a clean
  // error rather than a P2002.
  const dup = await prisma.choiceOption.findUnique({
    where: { field_name: { field: existing.field, name: newName } },
    select: { id: true },
  });
  if (dup) return { ok: false, message: `"${newName}" already exists for this field.` };

  // Rename in a transaction so the option row and the affected candidate
  // records stay in sync. Candidate updates are scoped to this org.
  const result = await prisma.$transaction(async (tx) => {
    const renamed = await tx.candidate.updateMany({
      where:
        existing.field === CHOICE_FIELDS.candidateSource.key
          ? { source: existing.name, organizationId: orgId }
          : { seniority: existing.name, organizationId: orgId },
      data:
        existing.field === CHOICE_FIELDS.candidateSource.key
          ? { source: newName }
          : { seniority: newName },
    });
    await tx.choiceOption.update({
      where: { id: optionId },
      data: { name: newName },
    });
    return renamed.count;
  });

  handler.invalidate();
  revalidatePath("/settings/choices");
  return {
    ok: true,
    message:
      result > 0
        ? `Renamed to "${newName}". ${result} record${result === 1 ? "" : "s"} updated.`
        : `Renamed to "${newName}".`,
    affected: result,
  };
}

export async function deleteChoiceOption(optionId: string): Promise<ChoiceActionResult> {
  const { orgId } = await requireOwnerWithOrg();
  const existing = await prisma.choiceOption.findFirst({
    where: { id: optionId, organizationId: orgId },
    select: { field: true, name: true },
  });
  if (!existing) return { ok: false, message: "Option not found." };
  const handler = getHandler(existing.field);

  const cleared = await prisma.$transaction(async (tx) => {
    const nulled =
      existing.field === CHOICE_FIELDS.candidateSource.key
        ? await tx.candidate.updateMany({
            where: { source: existing.name, organizationId: orgId },
            data: { source: null },
          })
        : await tx.candidate.updateMany({
            where: { seniority: existing.name, organizationId: orgId },
            data: { seniority: null },
          });
    await tx.choiceOption.delete({ where: { id: optionId } });
    return nulled.count;
  });

  handler.invalidate();
  revalidatePath("/settings/choices");
  return {
    ok: true,
    message:
      cleared > 0
        ? `Deleted "${existing.name}". ${cleared} record${cleared === 1 ? "" : "s"} cleared.`
        : `Deleted "${existing.name}".`,
    affected: cleared,
  };
}
