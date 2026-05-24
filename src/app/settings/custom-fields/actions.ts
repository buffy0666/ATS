"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CustomFieldEntity, CustomFieldType } from "@/generated/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export type CustomFieldResult = { ok: true } | { ok: false; error: string };

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

const baseSchema = z.object({
  entity: z.nativeEnum(CustomFieldEntity),
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(KEY_PATTERN, "Key must start with a letter and use only lowercase letters, digits, _"),
  label: z.string().trim().min(1).max(120),
  type: z.nativeEnum(CustomFieldType),
  helpText: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  required: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  options: z
    .string()
    .max(4000)
    .optional()
    .default("")
    .transform((v) => parseOptions(v)),
});

function parseOptions(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

function typeNeedsOptions(type: CustomFieldType) {
  return type === CustomFieldType.SELECT || type === CustomFieldType.MULTI_SELECT;
}

function formInput(formData: FormData) {
  return {
    entity: formData.get("entity"),
    key: formData.get("key"),
    label: formData.get("label"),
    type: formData.get("type"),
    helpText: formData.get("helpText"),
    required: formData.get("required") ?? false,
    options: formData.get("options"),
  };
}

export async function createCustomField(formData: FormData): Promise<CustomFieldResult> {
  await requireAdmin();

  const parsed = baseSchema.safeParse(formInput(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { entity, key, label, type, helpText, required, options } = parsed.data;

  if (typeNeedsOptions(type) && options.length === 0) {
    return { ok: false, error: "Add at least one option (one per line or comma-separated)." };
  }

  const existing = await prisma.customField.findUnique({
    where: { entity_key: { entity, key } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: `Field "${key}" already exists for this entity.` };
  }

  const max = await prisma.customField.aggregate({
    where: { entity },
    _max: { sortOrder: true },
  });

  await prisma.customField.create({
    data: {
      entity,
      key,
      label,
      type,
      helpText,
      required,
      options: typeNeedsOptions(type) ? options : [],
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings/custom-fields");
  return { ok: true };
}

export async function updateCustomField(id: string, formData: FormData): Promise<CustomFieldResult> {
  await requireAdmin();

  const parsed = baseSchema.safeParse(formInput(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { entity, key, label, type, helpText, required, options } = parsed.data;

  if (typeNeedsOptions(type) && options.length === 0) {
    return { ok: false, error: "Add at least one option (one per line or comma-separated)." };
  }

  const current = await prisma.customField.findUnique({
    where: { id },
    select: { id: true, type: true, entity: true },
  });
  if (!current) return { ok: false, error: "Field not found." };

  // Changing type would orphan stored values shaped for the old type.
  if (current.type !== type) {
    return { ok: false, error: "Field type cannot be changed once created. Delete and recreate instead." };
  }
  if (current.entity !== entity) {
    return { ok: false, error: "Field entity cannot be changed." };
  }

  await prisma.customField.update({
    where: { id },
    data: {
      key,
      label,
      helpText,
      required,
      options: typeNeedsOptions(type) ? options : [],
    },
  });

  revalidatePath("/settings/custom-fields");
  return { ok: true };
}

export async function deleteCustomField(id: string): Promise<CustomFieldResult> {
  await requireAdmin();
  await prisma.customField.delete({ where: { id } }); // cascades to values
  revalidatePath("/settings/custom-fields");
  return { ok: true };
}

export async function reorderCustomField(id: string, direction: "up" | "down"): Promise<CustomFieldResult> {
  await requireAdmin();
  const target = await prisma.customField.findUnique({
    where: { id },
    select: { id: true, entity: true, sortOrder: true },
  });
  if (!target) return { ok: false, error: "Field not found." };

  const neighbor = await prisma.customField.findFirst({
    where: {
      entity: target.entity,
      sortOrder: direction === "up" ? { lt: target.sortOrder } : { gt: target.sortOrder },
    },
    orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    select: { id: true, sortOrder: true },
  });
  if (!neighbor) return { ok: true }; // already at edge

  await prisma.$transaction([
    prisma.customField.update({ where: { id: target.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.customField.update({ where: { id: neighbor.id }, data: { sortOrder: target.sortOrder } }),
  ]);

  revalidatePath("/settings/custom-fields");
  return { ok: true };
}
