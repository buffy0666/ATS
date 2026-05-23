"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CHOICE_FIELDS } from "@/lib/choices";

const MAX_NAME = 80;

export type ChoiceActionResult =
  | { ok: true; message: string; affected?: number }
  | { ok: false; message: string };

type FieldHandler = {
  count: (name: string) => Promise<number>;
  rename: (oldName: string, newName: string) => Promise<{ count: number }>;
  nullify: (name: string) => Promise<{ count: number }>;
  invalidate: () => void;
};

const FIELD_HANDLERS: Record<string, FieldHandler> = {
  [CHOICE_FIELDS.candidateSource.key]: {
    count: (name) => prisma.candidate.count({ where: { source: name } }),
    rename: (oldName, newName) =>
      prisma.candidate.updateMany({ where: { source: oldName }, data: { source: newName } }),
    nullify: (name) =>
      prisma.candidate.updateMany({ where: { source: name }, data: { source: null } }),
    invalidate: () => {
      revalidatePath("/candidates");
    },
  },
  [CHOICE_FIELDS.candidateSeniority.key]: {
    count: (name) => prisma.candidate.count({ where: { seniority: name } }),
    rename: (oldName, newName) =>
      prisma.candidate.updateMany({
        where: { seniority: oldName },
        data: { seniority: newName },
      }),
    nullify: (name) =>
      prisma.candidate.updateMany({ where: { seniority: name }, data: { seniority: null } }),
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
  await requireSession();
  return getHandler(field).count(name);
}

export async function createChoiceOption(
  field: string,
  rawName: string,
): Promise<ChoiceActionResult> {
  await requireSession();
  const name = clean(rawName);
  if (!name) return { ok: false, message: "Name is required." };
  if (name.length > MAX_NAME) return { ok: false, message: `Name too long (max ${MAX_NAME}).` };
  getHandler(field); // validates the field key

  // Place new options at the end of the list.
  const max = await prisma.choiceOption.findFirst({
    where: { field },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  try {
    await prisma.choiceOption.create({
      data: { field, name, sortOrder: (max?.sortOrder ?? -1) + 1 },
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
  await requireSession();
  const newName = clean(rawNewName);
  if (!newName) return { ok: false, message: "Name is required." };
  if (newName.length > MAX_NAME) return { ok: false, message: `Name too long (max ${MAX_NAME}).` };

  const existing = await prisma.choiceOption.findUnique({
    where: { id: optionId },
    select: { field: true, name: true },
  });
  if (!existing) return { ok: false, message: "Option not found." };
  if (existing.name === newName) return { ok: true, message: "No changes.", affected: 0 };

  const handler = getHandler(existing.field);

  // Block duplicate name within the same field.
  const dup = await prisma.choiceOption.findUnique({
    where: { field_name: { field: existing.field, name: newName } },
    select: { id: true },
  });
  if (dup) return { ok: false, message: `"${newName}" already exists for this field.` };

  // Rename in a transaction so the option row and the affected records stay
  // in sync — if either side fails, neither commits.
  const result = await prisma.$transaction(async (tx) => {
    const renamed = await tx.candidate.updateMany({
      where: existing.field === CHOICE_FIELDS.candidateSource.key
        ? { source: existing.name }
        : { seniority: existing.name },
      data: existing.field === CHOICE_FIELDS.candidateSource.key
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
  await requireSession();
  const existing = await prisma.choiceOption.findUnique({
    where: { id: optionId },
    select: { field: true, name: true },
  });
  if (!existing) return { ok: false, message: "Option not found." };
  const handler = getHandler(existing.field);

  const cleared = await prisma.$transaction(async (tx) => {
    const nulled =
      existing.field === CHOICE_FIELDS.candidateSource.key
        ? await tx.candidate.updateMany({
            where: { source: existing.name },
            data: { source: null },
          })
        : await tx.candidate.updateMany({
            where: { seniority: existing.name },
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
