"use server";

import { revalidatePath } from "next/cache";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { parseCsv, rowsToRecords } from "@/lib/csv";
import { tagColorForName } from "@/lib/tag-colors";
import { parseCandidateRow } from "./columns";
import type { ImportResult, RowResult } from "./import-types";

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS_PER_IMPORT = 5000;

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
      `CSV is missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Headers detected: ${sample || "(none)"}. If the file came from Excel, make sure you saved it as 'CSV UTF-8 (Comma delimited)' — not .xlsx or .txt.`,
    );
  }
  if (records.length > MAX_ROWS_PER_IMPORT) {
    return failure(
      `Too many rows (${records.length}). Max is ${MAX_ROWS_PER_IMPORT} per import — split the file and try again.`,
    );
  }

  const rowResults: RowResult[] = [];
  let created = 0;
  let skipped = 0;
  let errored = 0;

  // Sequential to keep error attribution clean and avoid hammering the DB.
  for (let i = 0; i < records.length; i++) {
    const csvRow = i + 2; // +1 for header, +1 for 1-based indexing
    const record = records[i];

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
        record,
      });
      continue;
    }

    try {
      // Dedupe by email *within this org*. Two firms can both have a
      // "jane@example.com" without collision once Phase 6 swaps the
      // global Candidate.email unique to an org-scoped compound.
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
          sourcedById: session.user.id ?? null,
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
        record,
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
  // Phase 1-5 limitation: Tag.name is still globally @unique. Upsert uses
  // that global key, so two orgs literally can't have a tag with the same
  // name. The unique becomes [organizationId, name] in Phase 6 and this
  // upsert will switch to the compound key then. For now, ensure the
  // existing row is tagged with this org (won't overwrite if it already
  // belongs to someone else — which would be a multi-tenant bug Phase 6
  // fixes properly).
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
