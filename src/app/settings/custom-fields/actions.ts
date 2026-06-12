"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CustomFieldEntity, CustomFieldType } from "@/generated/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";
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
  const { orgId } = await requireAdminWithOrg();

  const parsed = baseSchema.safeParse(formInput(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { entity, key, label, type, helpText, required, options } = parsed.data;

  if (typeNeedsOptions(type) && options.length === 0) {
    return { ok: false, error: "Add at least one option (one per line or comma-separated)." };
  }

  // Per-org dedupe: two orgs can independently use the same (entity, key)
  // — this check only blocks duplicates within the caller's workspace.
  const existing = await prisma.customField.findUnique({
    where: { organizationId_entity_key: { organizationId: orgId, entity, key } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: `Field "${key}" already exists for this entity.` };
  }

  const max = await prisma.customField.aggregate({
    where: { entity, organizationId: orgId },
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
      organizationId: orgId,
    },
  });

  revalidatePath("/settings/custom-fields");
  return { ok: true };
}

export async function updateCustomField(id: string, formData: FormData): Promise<CustomFieldResult> {
  const { orgId } = await requireAdminWithOrg();

  const parsed = baseSchema.safeParse(formInput(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { entity, key, label, type, helpText, required, options } = parsed.data;

  if (typeNeedsOptions(type) && options.length === 0) {
    return { ok: false, error: "Add at least one option (one per line or comma-separated)." };
  }

  // findFirst by (id, organizationId) so a guessed id from another tenant
  // can't be edited via this endpoint.
  const current = await prisma.customField.findFirst({
    where: { id, organizationId: orgId },
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
  const { orgId } = await requireAdminWithOrg();
  // deleteMany so a stray id from another org just no-ops instead of
  // bleeding across tenants. Cascade still cleans up CustomFieldValue.
  await prisma.customField.deleteMany({ where: { id, organizationId: orgId } });
  revalidatePath("/settings/custom-fields");
  return { ok: true };
}

export async function reorderCustomField(id: string, direction: "up" | "down"): Promise<CustomFieldResult> {
  const { orgId } = await requireAdminWithOrg();
  const target = await prisma.customField.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, entity: true, sortOrder: true },
  });
  if (!target) return { ok: false, error: "Field not found." };

  const neighbor = await prisma.customField.findFirst({
    where: {
      entity: target.entity,
      organizationId: orgId,
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
