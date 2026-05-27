"use server";

import { revalidatePath } from "next/cache";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { parseCsv, rowsToRecords } from "@/lib/csv";
import { tagColorForName } from "@/lib/tag-colors";
import { parseCandidateRow } from "./columns";
import { REQUIRED_FIELD_KEYS, type FieldMapping } from "./field-catalog";
import type { ImportResult, RowResult } from "./import-types";

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

  const text = await file.text();
  const grid = parseCsv(text);
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

  const unmapped = REQUIRED_FIELD_KEYS.filter((k) => !mapping[k]);
  if (unmapped.length > 0) {
    return failure(
      `These required fields aren't mapped: ${unmapped.join(", ")}. Pair each to an input column before importing.`,
    );
  }

  const text = await file.text();
  const grid = parseCsv(text);
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
  return runImport(canonicalRecords, headers, orgId, session.user.id ?? null, records);
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
