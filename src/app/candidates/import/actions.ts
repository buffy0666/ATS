"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { CustomFieldEntity, CustomFieldType, Role } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { parseCsv, rowsToRecords } from "@/lib/csv";
import { tagColorForName } from "@/lib/tag-colors";
import { parseCandidateRow } from "./columns";
import { REQUIRED_FIELD_KEYS, slugifyFieldKey, type FieldMapping } from "./field-catalog";
import type { ImportResult, RowResult } from "./import-types";

/** A header the user chose to capture as a brand-new custom field. */
export type NewFieldSpec = { header: string; label: string; type: CustomFieldType };

/** Resolved new field — its DB id plus the source header + type for value writes. */
type ResolvedNewField = { fieldId: string; header: string; type: CustomFieldType };

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS_PER_IMPORT = 5000;

/**
 * Template import — the CSV's headers are already the canonical field keys
 * (the downloadable template format). Requires firstName/lastName/email
 * columns present verbatim.
 */
export async function importCandidatesCsv(formData: FormData): Promise<ImportResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return failure("Choose a CSV file before importing.");
  }
  if (file.size > MAX_CSV_BYTES) {
    return failure(`File too large (${file.size} bytes). Max is ${MAX_CSV_BYTES} bytes.`);
  }

  let grid: string[][];
  try {
    const text = await file.text();
    grid = parseCsv(text);
  } catch {
    return failure(
      "Couldn't read this file as CSV. If it came from Excel, save it as 'CSV UTF-8 (Comma delimited)' (not .xlsx) and try again.",
    );
  }
  if (grid.length < 2) {
    return failure("CSV needs a header row followed by at least one data row.");
  }

  const { headers, records } = rowsToRecords(grid);
  const lowerHeaders = headers.map((h) => h.toLowerCase());
  const required = ["firstname", "lastname", "email"];
  const missing = required.filter((r) => !lowerHeaders.includes(r));
  if (missing.length > 0) {
    const sample = headers.slice(0, 8).join(", ") + (headers.length > 8 ? `, … (${headers.length} total)` : "");
    return failure(
      `CSV is missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Headers detected: ${sample || "(none)"}. If the file came from Excel, save it as 'CSV UTF-8 (Comma delimited)' — or use "Map fields from my file" to pair columns manually.`,
    );
  }
  if (records.length > MAX_ROWS_PER_IMPORT) {
    return failure(
      `Too many rows (${records.length}). Max is ${MAX_ROWS_PER_IMPORT} per import — split the file and try again.`,
    );
  }

  return runImport(records, headers, orgId, session.user.id ?? null);
}

/**
 * Mapping import — the CSV can have arbitrary headers. A `mapping` field
 * (JSON: canonicalField → inputHeader) translates each row into the
 * canonical shape parseCandidateRow expects. Fields the user skipped are
 * absent from the mapping (or null).
 */
export async function importCandidatesWithMapping(formData: FormData): Promise<ImportResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return failure("Choose a CSV file before importing.");
  }
  if (file.size > MAX_CSV_BYTES) {
    return failure(`File too large (${file.size} bytes). Max is ${MAX_CSV_BYTES} bytes.`);
  }

  let mapping: FieldMapping;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}")) as FieldMapping;
  } catch {
    return failure("Field mapping was malformed. Re-open the mapping editor and try again.");
  }

  let newFields: NewFieldSpec[];
  try {
    newFields = JSON.parse(String(formData.get("newFields") ?? "[]")) as NewFieldSpec[];
    if (!Array.isArray(newFields)) newFields = [];
  } catch {
    return failure("New-field selections were malformed. Re-open the mapping editor and try again.");
  }

  const unmapped = REQUIRED_FIELD_KEYS.filter((k) => !mapping[k]);
  if (unmapped.length > 0) {
    return failure(
      `These required fields aren't mapped: ${unmapped.join(", ")}. Pair each to an input column before importing.`,
    );
  }

  let grid: string[][];
  try {
    const text = await file.text();
    grid = parseCsv(text);
  } catch {
    return failure("Couldn't read this file as CSV. Re-save it as 'CSV UTF-8 (Comma delimited)' and try again.");
  }
  if (grid.length < 2) {
    return failure("CSV needs a header row followed by at least one data row.");
  }

  const { headers, records } = rowsToRecords(grid);

  const headerSet = new Set(headers);
  const badTargets = [
    ...new Set(
      Object.values(mapping).filter(
        (h): h is string => typeof h === "string" && h.length > 0 && !headerSet.has(h),
      ),
    ),
  ];
  if (badTargets.length > 0) {
    return failure(
      `Mapping references columns not in the file: ${badTargets.join(", ")}. Re-upload and re-map.`,
    );
  }

  if (records.length > MAX_ROWS_PER_IMPORT) {
    return failure(
      `Too many rows (${records.length}). Max is ${MAX_ROWS_PER_IMPORT} per import — split the file and try again.`,
    );
  }

  // Creating new fields is admin-gated: verify role + password, then create
  // the CustomField definitions and resolve them to ids for value writes.
  let resolvedNewFields: ResolvedNewField[] = [];
  if (newFields.length > 0) {
    const valid = newFields.filter((f) => f && headerSet.has(f.header));
    if (valid.length > 0) {
      const auth = await authorizeFieldCreation(
        session.user.id ?? null,
        String(formData.get("adminPassword") ?? ""),
      );
      if (!auth.ok) return failure(auth.error);
      try {
        resolvedNewFields = await ensureCustomFields(valid, orgId);
      } catch (e) {
        return failure(e instanceof Error ? e.message : "Could not create the new fields.");
      }
    }
  }

  // Translate each input row into a canonical-keyed record.
  const canonicalRecords = records.map((rec) => {
    const out: Record<string, string> = {};
    for (const [field, inputHeader] of Object.entries(mapping)) {
      if (inputHeader) out[field] = rec[inputHeader] ?? "";
    }
    return out;
  });

  // Keep the original rows + headers for the errored-row download so it
  // mirrors the user's actual file, not the remapped shape.
  return runImport(canonicalRecords, headers, orgId, session.user.id ?? null, records, resolvedNewFields);
}

/**
 * Gate for creating new custom fields during import. The current user must
 * be an admin and must re-enter their own login password (bcrypt-checked).
 */
async function authorizeFieldCreation(
  userId: string | null,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: "You must be signed in to create fields." };
  if (!password) return { ok: false, error: "Enter your admin password to create new fields." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, passwordHash: true },
  });
  if (!user || user.role !== Role.ADMIN) {
    return { ok: false, error: "Only admins can create new fields during import." };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false, error: "That password is incorrect." };
  return { ok: true };
}

/**
 * Create (or reuse) a CustomField on the CANDIDATE entity for each chosen
 * header. Keys are slugified from the header and de-duplicated; if a field
 * with the key already exists for this org it's reused rather than failing.
 */
async function ensureCustomFields(
  specs: NewFieldSpec[],
  orgId: string,
): Promise<ResolvedNewField[]> {
  const resolved: ResolvedNewField[] = [];
  const usedKeys = new Set<string>();

  // Next free sort order so new fields append after existing ones.
  const max = await prisma.customField.aggregate({
    where: { entity: CustomFieldEntity.CANDIDATE, organizationId: orgId },
    _max: { sortOrder: true },
  });
  let sortOrder = (max._max.sortOrder ?? -1) + 1;

  for (const spec of specs) {
    const label = (spec.label || spec.header).trim().slice(0, 120) || spec.header;
    const type = Object.values(CustomFieldType).includes(spec.type)
      ? spec.type
      : CustomFieldType.TEXT;

    // Find a free key (header slug, then -2, -3, …) not already taken this run.
    const base = slugifyFieldKey(spec.header);
    let key = base;
    for (let n = 2; usedKeys.has(key); n++) key = `${base}_${n}`.slice(0, 60);

    // Reuse an existing field with this key in the org; otherwise create.
    const existing = await prisma.customField.findFirst({
      where: { entity: CustomFieldEntity.CANDIDATE, organizationId: orgId, key },
      select: { id: true, type: true },
    });
    if (existing) {
      usedKeys.add(key);
      resolved.push({ fieldId: existing.id, header: spec.header, type: existing.type });
      continue;
    }

    const created = await prisma.customField.create({
      data: {
        entity: CustomFieldEntity.CANDIDATE,
        key,
        label,
        type,
        required: false,
        options: [],
        sortOrder: sortOrder++,
        organizationId: orgId,
      },
      select: { id: true },
    });
    usedKeys.add(key);
    resolved.push({ fieldId: created.id, header: spec.header, type });
  }

  revalidatePath("/settings/custom-fields");
  return resolved;
}

/**
 * Shared import loop. `records` are canonical-keyed (post-remap in mapping
 * mode, as-is in template mode). `rawRecords`/`headers` drive the
 * errored-row download CSV.
 */
async function runImport(
  records: Record<string, string>[],
  headers: string[],
  orgId: string,
  sourcedById: string | null,
  rawRecords?: Record<string, string>[],
  newFields: ResolvedNewField[] = [],
): Promise<ImportResult> {
  const rowResults: RowResult[] = [];
  let created = 0;
  let skipped = 0;
  let errored = 0;

  // Sequential to keep error attribution clean and avoid hammering the DB.
  for (let i = 0; i < records.length; i++) {
    const csvRow = i + 2; // +1 for header, +1 for 1-based indexing
    const record = records[i];
    const rawRecord = rawRecords?.[i] ?? record;

    let parsed;
    try {
      parsed = parseCandidateRow(record);
    } catch (error) {
      errored++;
      rowResults.push({
        row: csvRow,
        email: record.email?.trim().toLowerCase() || null,
        status: "error",
        reason: error instanceof Error ? error.message : "Unknown parse error",
        record: rawRecord,
      });
      continue;
    }

    try {
      // Dedupe by email within this org.
      const existing = await prisma.candidate.findFirst({
        where: { email: parsed.email, organizationId: orgId },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        rowResults.push({
          row: csvRow,
          email: parsed.email,
          status: "skipped",
          reason: "Candidate with this email already exists",
        });
        continue;
      }

      const tagIds = await syncTagNamesToIds(parsed.tags, orgId);
      const candidate = await prisma.candidate.create({
        data: {
          ...parsed.data,
          sourcedById,
          organizationId: orgId,
          tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
        },
        select: { id: true },
      });
      await writeNewFieldValues(candidate.id, rawRecord, newFields);
      created++;
      rowResults.push({
        row: csvRow,
        email: parsed.email,
        status: "created",
        candidateId: candidate.id,
      });
    } catch (error) {
      errored++;
      rowResults.push({
        row: csvRow,
        email: parsed.email,
        status: "error",
        reason: error instanceof Error ? error.message : "Database error",
        record: rawRecord,
      });
    }
  }

  if (created > 0) revalidatePath("/candidates");

  return {
    status: "success",
    message: `Imported ${created}, skipped ${skipped}, ${errored} errored.`,
    created,
    skipped,
    errored,
    rows: rowResults,
    headers,
  };
}

function failure(message: string): ImportResult {
  return {
    status: "error",
    message,
    created: 0,
    skipped: 0,
    errored: 0,
    rows: [],
    headers: [],
  };
}

/**
 * Persist the raw cell value for each newly-created custom field on one
 * candidate. Coerces the string into the column shape the field's type
 * expects; blank cells are skipped (no row written).
 */
async function writeNewFieldValues(
  candidateId: string,
  rawRecord: Record<string, string>,
  newFields: ResolvedNewField[],
): Promise<void> {
  for (const f of newFields) {
    const raw = (rawRecord[f.header] ?? "").trim();
    if (!raw) continue;

    const data: {
      valueText?: string | null;
      valueNumber?: number | null;
      valueDate?: Date | null;
      valueBoolean?: boolean | null;
      valueStrings?: string[];
    } = {};

    switch (f.type) {
      case CustomFieldType.NUMBER: {
        const n = Number(raw);
        if (!Number.isFinite(n)) continue;
        data.valueNumber = n;
        break;
      }
      case CustomFieldType.DATE: {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) continue;
        data.valueDate = d;
        break;
      }
      case CustomFieldType.BOOLEAN:
        data.valueBoolean = /^(yes|true|1|y)$/i.test(raw);
        break;
      case CustomFieldType.MULTI_SELECT:
        data.valueStrings = raw.split("|").map((s) => s.trim()).filter(Boolean);
        break;
      default:
        // TEXT, LONG_TEXT, URL, EMAIL, SELECT
        data.valueText = raw;
    }

    await prisma.customFieldValue.upsert({
      where: { fieldId_entityId: { fieldId: f.fieldId, entityId: candidateId } },
      create: { fieldId: f.fieldId, entityId: candidateId, ...data },
      update: data,
    });
  }
}

async function syncTagNamesToIds(rawNames: string[], orgId: string): Promise<string[]> {
  const names = Array.from(
    new Set(rawNames.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 60)),
  );
  if (names.length === 0) return [];
  const tags = await Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { name },
        create: { name, color: tagColorForName(name), organizationId: orgId },
        update: {},
      }),
    ),
  );
  return tags.map((t) => t.id);
}
