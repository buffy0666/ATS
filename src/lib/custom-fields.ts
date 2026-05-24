import "server-only";

import { CustomFieldEntity, CustomFieldType, type CustomFieldValue } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

// Re-export shared (client-safe) constants and types so existing
// server-side imports of `@/lib/custom-fields` keep working unchanged.
export {
  CUSTOM_FIELD_ENTITY_LABEL,
  CUSTOM_FIELD_TYPE_LABEL,
  type CustomFieldRow,
} from "./custom-fields-shared";
import type { CustomFieldRow } from "./custom-fields-shared";

/**
 * Load active field definitions for an entity, in display order.
 */
export async function loadCustomFields(entity: CustomFieldEntity): Promise<CustomFieldRow[]> {
  return prisma.customField.findMany({
    where: { entity, active: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      entity: true,
      key: true,
      label: true,
      type: true,
      helpText: true,
      required: true,
      options: true,
      sortOrder: true,
      active: true,
    },
  });
}

/**
 * Load all values for one record, returned as a map keyed by field id.
 */
export async function loadCustomFieldValues(
  entity: CustomFieldEntity,
  entityId: string,
): Promise<Map<string, CustomFieldValue>> {
  const rows = await prisma.customFieldValue.findMany({
    where: {
      entityId,
      field: { entity },
    },
  });
  return new Map(rows.map((r) => [r.fieldId, r]));
}

/**
 * Returns the JS-shaped value for a single CustomFieldValue row, based on
 * the field's type. Used for rendering on detail pages.
 */
export function readCustomFieldValue(
  field: CustomFieldRow,
  value: CustomFieldValue | undefined,
): unknown {
  if (!value) return null;
  switch (field.type) {
    case CustomFieldType.TEXT:
    case CustomFieldType.LONG_TEXT:
    case CustomFieldType.URL:
    case CustomFieldType.EMAIL:
    case CustomFieldType.SELECT:
      return value.valueText;
    case CustomFieldType.NUMBER:
      return value.valueNumber;
    case CustomFieldType.DATE:
      return value.valueDate;
    case CustomFieldType.BOOLEAN:
      return value.valueBoolean;
    case CustomFieldType.MULTI_SELECT:
      return value.valueStrings ?? [];
  }
}

/**
 * Persist custom field values for a single record from a FormData payload.
 *
 * Each form input uses `name="cf:<fieldId>"` so we know which definition to
 * route the value to. MULTI_SELECT collects via formData.getAll().
 *
 * Throws on missing required fields. Empty/null values delete the existing
 * row so we don't leave dead data around.
 */
export async function saveCustomFieldValues(
  entity: CustomFieldEntity,
  entityId: string,
  formData: FormData,
): Promise<void> {
  const fields = await loadCustomFields(entity);
  if (fields.length === 0) return;

  for (const field of fields) {
    const inputName = `cf:${field.id}`;
    const raw = field.type === CustomFieldType.MULTI_SELECT
      ? formData.getAll(inputName).map(String).filter(Boolean)
      : formData.get(inputName);

    const data = coerceForStorage(field, raw);
    if (data === DELETE_VALUE) {
      if (field.required) {
        throw new Error(`Custom field "${field.label}" is required.`);
      }
      await prisma.customFieldValue.deleteMany({
        where: { fieldId: field.id, entityId },
      });
      continue;
    }

    await prisma.customFieldValue.upsert({
      where: { fieldId_entityId: { fieldId: field.id, entityId } },
      create: { fieldId: field.id, entityId, ...data },
      update: data,
    });
  }
}

/** Remove every custom field value attached to a record. Call from delete actions. */
export async function deleteCustomFieldValuesFor(
  entity: CustomFieldEntity,
  entityId: string,
): Promise<void> {
  await prisma.customFieldValue.deleteMany({
    where: { entityId, field: { entity } },
  });
}

const DELETE_VALUE = Symbol("delete");
type StoredValue = {
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: Date | null;
  valueBoolean?: boolean | null;
  valueStrings?: string[];
};

function coerceForStorage(field: CustomFieldRow, raw: FormDataEntryValue | string[] | null):
  | StoredValue
  | typeof DELETE_VALUE {
  if (field.type === CustomFieldType.MULTI_SELECT) {
    const arr = Array.isArray(raw)
      ? raw.filter((v) => field.options.includes(v))
      : [];
    if (arr.length === 0) return DELETE_VALUE;
    return { valueStrings: arr };
  }

  const str = typeof raw === "string" ? raw.trim() : "";
  if (!str && field.type !== CustomFieldType.BOOLEAN) return DELETE_VALUE;

  switch (field.type) {
    case CustomFieldType.TEXT:
    case CustomFieldType.LONG_TEXT:
      return { valueText: str };
    case CustomFieldType.URL:
      return { valueText: ensureScheme(str) };
    case CustomFieldType.EMAIL:
      return { valueText: str.toLowerCase() };
    case CustomFieldType.SELECT:
      if (!field.options.includes(str)) return DELETE_VALUE;
      return { valueText: str };
    case CustomFieldType.NUMBER: {
      const n = Number(str.replace(/[,$\s]/g, ""));
      if (!Number.isFinite(n)) return DELETE_VALUE;
      return { valueNumber: n };
    }
    case CustomFieldType.DATE: {
      const d = new Date(str);
      if (Number.isNaN(d.getTime())) return DELETE_VALUE;
      return { valueDate: d };
    }
    case CustomFieldType.BOOLEAN: {
      const truthy = str === "on" || str === "true" || str === "1" || str === "yes";
      return { valueBoolean: truthy };
    }
  }
}

function ensureScheme(url: string): string {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
