"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CustomFieldType } from "@/generated/prisma";
import { CUSTOM_FIELD_TYPE_LABEL } from "@/lib/custom-fields-shared";
import { parseCsv } from "@/lib/csv";
import { importCandidatesWithMapping } from "./actions";
import {
  autoMatchFields,
  IMPORT_FIELDS,
  REQUIRED_FIELD_KEYS,
  slugifyFieldKey,
  type FieldMapping,
} from "./field-catalog";
import type { ExistingCustomField } from "./ImportTabs";
import { FileDropzone } from "./FileDropzone";
import { ImportResults } from "./ImportResults";
import { initialImportResult, type ImportMode, type ImportResult } from "./import-types";
import { MAX_CSV_BYTES, MAX_ROWS_PER_IMPORT, formatBytes } from "./limits";
import { clusterValues, type ClusterResult } from "./fuzzy";
import {
  clearImportMapping,
  loadImportMapping,
  saveImportMapping,
  type SavedMapping,
} from "./mapping-actions";

const SKIP = "__skip__";
const REQUIRED = new Set(REQUIRED_FIELD_KEYS);

// Above this many distinct values, a Single/Multi choice field probably
// represents free text rather than a real enum — require the user to
// explicitly confirm before we let it through.
const CHOICE_HIGH_CARDINALITY = 10;

// Types offered for auto-created fields. SELECT / MULTI_SELECT used to be
// excluded because they need a predefined option list — now the importer
// derives that list from the column's own values (with fuzzy de-dup).
const NEW_FIELD_TYPES: CustomFieldType[] = [
  CustomFieldType.TEXT,
  CustomFieldType.LONG_TEXT,
  CustomFieldType.NUMBER,
  CustomFieldType.DATE,
  CustomFieldType.BOOLEAN,
  CustomFieldType.SELECT,
  CustomFieldType.MULTI_SELECT,
  CustomFieldType.URL,
  CustomFieldType.EMAIL,
];

function isChoiceType(t: CustomFieldType) {
  return t === CustomFieldType.SELECT || t === CustomFieldType.MULTI_SELECT;
}

type NewFieldDraft = { create: boolean; label: string; type: CustomFieldType };

/** Per-header analysis result for choice fields. */
type ChoiceAnalysis = {
  distinct: string[];        // raw distinct cell values (after split for MULTI)
  cluster: ClusterResult;    // auto-merge result + flagged near-dupes
  options: string[];         // final canonical options after user merges
  valueMap: Record<string, string>; // raw → canonical (sent to server)
};

/**
 * Field-mapping flow:
 *   1. Pick a file. We read its header row client-side (lib/csv parseCsv)
 *      and auto-match each input column to a candidate field.
 *   2. The mapping table shows existing fields on the left, a dropdown of
 *      the file's columns on the right, with "Skip" for anything unmatched.
 *   3. Import sends the file + the mapping JSON to the server action,
 *      which remaps each row and runs the standard import pipeline.
 */
export function MappingImportForm({
  importMode = "create",
  existingCustomFields = [],
}: {
  importMode?: ImportMode;
  existingCustomFields?: ExistingCustomField[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [importName, setImportName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRow, setPreviewRow] = useState<Record<string, string>>({});
  const [columnValues, setColumnValues] = useState<Record<string, string[]>>({});
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [newFieldDrafts, setNewFieldDrafts] = useState<Record<string, NewFieldDraft>>({});
  // For each header that's a choice field, the user's explicit "merge X into Y"
  // decisions on top of the auto-merge clustering. `userMerges[header][raw] = target`.
  const [userMerges, setUserMerges] = useState<Record<string, Record<string, string>>>({});
  // For each choice header with > CHOICE_HIGH_CARDINALITY options, has the
  // user confirmed they really want it as a choice field?
  const [confirmHigh, setConfirmHigh] = useState<Record<string, boolean>>({});
  const [adminPassword, setAdminPassword] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult>(initialImportResult);
  const [pending, startTransition] = useTransition();
  // The saved-mapping row we restored from for this header set, if any.
  // Drives the "Restored mapping by X on Y — Reset" banner.
  const [restoredFrom, setRestoredFrom] = useState<SavedMapping | null>(null);

  async function onFileSelected(f: File | null) {
    setResult(initialImportResult);
    setParseError(null);
    setFile(f);
    setHeaders([]);
    setMapping({});
    setNewFieldDrafts({});
    setUserMerges({});
    setConfirmHigh({});
    setAdminPassword("");
    setPreviewRow({});
    setColumnValues({});
    setRestoredFrom(null);
    if (!f) return;

    if (f.size > MAX_CSV_BYTES) {
      setParseError(
        `File is too large (${formatBytes(f.size)}). Max is ${formatBytes(MAX_CSV_BYTES)} per import — split it (up to ${MAX_ROWS_PER_IMPORT.toLocaleString()} rows per file) and try again.`,
      );
      return;
    }

    try {
      const text = await f.text();
      const grid = parseCsv(text);
      if (grid.length < 1 || grid[0].length === 0) {
        setParseError("Couldn't read a header row from this file.");
        return;
      }
      // grid includes the header row, so data row count is grid.length - 1.
      if (grid.length - 1 > MAX_ROWS_PER_IMPORT) {
        setParseError(
          `File has ${(grid.length - 1).toLocaleString()} rows — max is ${MAX_ROWS_PER_IMPORT.toLocaleString()} per import. Split it and try again.`,
        );
        return;
      }
      const hdrs = grid[0].map((h) => h.trim()).filter(Boolean);
      setHeaders(hdrs);
      // First data row, for a live preview of what each field will receive.
      if (grid.length >= 2) {
        const preview: Record<string, string> = {};
        hdrs.forEach((h, idx) => {
          preview[h] = (grid[1][idx] ?? "").trim();
        });
        setPreviewRow(preview);
      }
      // Keep every cell so SELECT / MULTI_SELECT new-field drafts can
      // analyze their column's distinct values for fuzzy-merging.
      const cols: Record<string, string[]> = {};
      hdrs.forEach((h, idx) => {
        const vals: string[] = [];
        for (let r = 1; r < grid.length; r++) {
          const v = (grid[r][idx] ?? "").trim();
          if (v) vals.push(v);
        }
        cols[h] = vals;
      });
      setColumnValues(cols);

      // Restore a previously-saved mapping for this header set (org-wide),
      // or fall back to auto-match if none exists.
      try {
        const saved = await loadImportMapping(hdrs);
        if (saved) {
          setMapping(saved.mapping);
          setNewFieldDrafts(
            saved.newFieldDrafts as Record<string, NewFieldDraft>,
          );
          setUserMerges(saved.userMerges ?? {});
          setConfirmHigh(saved.confirmHigh ?? {});
          setRestoredFrom(saved);
        } else {
          setMapping(autoMatchFields(hdrs));
        }
      } catch {
        // If the lookup fails for any reason, fall back to auto-match so
        // the importer still works.
        setMapping(autoMatchFields(hdrs));
      }
    } catch {
      setParseError("Couldn't parse this file as CSV.");
    }
  }

  async function handleResetSavedMapping() {
    if (headers.length === 0) return;
    await clearImportMapping(headers);
    setRestoredFrom(null);
    setNewFieldDrafts({});
    setUserMerges({});
    setConfirmHigh({});
    setMapping(autoMatchFields(headers));
  }

  function setFieldMap(fieldKey: string, value: string) {
    setMapping((prev) => ({ ...prev, [fieldKey]: value === SKIP ? null : value }));
  }

  const mappedCount = useMemo(
    () => Object.values(mapping).filter(Boolean).length,
    [mapping],
  );
  const missingRequired = useMemo(
    () => REQUIRED_FIELD_KEYS.filter((k) => !mapping[k]),
    [mapping],
  );

  // File columns not associated with any candidate field — candidates for
  // becoming brand-new custom fields.
  const mappedColumns = useMemo(
    () => new Set(Object.values(mapping).filter(Boolean) as string[]),
    [mapping],
  );
  const unmatchedHeaders = useMemo(
    () => headers.filter((h) => !mappedColumns.has(h)),
    [headers, mappedColumns],
  );

  function draftFor(h: string): NewFieldDraft {
    return newFieldDrafts[h] ?? { create: false, label: h, type: CustomFieldType.TEXT };
  }
  function updateDraft(h: string, patch: Partial<NewFieldDraft>) {
    setNewFieldDrafts((prev) => ({ ...prev, [h]: { ...draftFor(h), ...patch } }));
  }

  const selectedNewHeaders = useMemo(
    () => unmatchedHeaders.filter((h) => newFieldDrafts[h]?.create),
    [unmatchedHeaders, newFieldDrafts],
  );

  // Map of existing custom-field key -> label, used to recognize drafts
  // that already correspond to a field created on a prior import. The
  // server's ensureCustomFields reuses by key, so these need no password.
  const existingByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of existingCustomFields) m.set(f.key, f.label);
    return m;
  }, [existingCustomFields]);

  // Returns the existing field's label if this header's slugified key
  // matches one already in the org, else undefined.
  const existingMatchFor = (h: string) =>
    existingByKey.get(slugifyFieldKey(h));

  // Only headers that would create a brand-new field count toward the
  // admin-password gate. Drafts that map onto an existing field skip it.
  const actuallyNewHeaders = useMemo(
    () => selectedNewHeaders.filter((h) => !existingMatchFor(h)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedNewHeaders, existingByKey],
  );

  const needsPassword = actuallyNewHeaders.length > 0;
  const passwordMissing = needsPassword && !adminPassword.trim();

  // For each selected SELECT/MULTI_SELECT new-field draft, run the
  // cell-value analysis: distinct values, auto-merges, near-dup flags,
  // and the user's resolved merges layered on top.
  const choiceAnalyses = useMemo(() => {
    const out: Record<string, ChoiceAnalysis> = {};
    for (const h of selectedNewHeaders) {
      const d = draftFor(h);
      if (!isChoiceType(d.type)) continue;

      const cells = columnValues[h] ?? [];
      const parts: string[] =
        d.type === CustomFieldType.MULTI_SELECT
          ? cells.flatMap((c) => c.split("|").map((s) => s.trim()).filter(Boolean))
          : cells;
      const distinct = Array.from(new Set(parts));
      const cluster = clusterValues(distinct);
      const merges = userMerges[h] ?? {};

      // Final raw -> canonical mapping, layering user merges on top of
      // the cluster's auto-merges by normalized form.
      const valueMap: Record<string, string> = {};
      for (const raw of distinct) {
        const afterAuto = cluster.mergeMap[raw] ?? raw;
        valueMap[raw] = merges[afterAuto] ?? afterAuto;
      }
      const options = Array.from(new Set(Object.values(valueMap)));

      out[h] = { distinct, cluster, options, valueMap };
    }
    return out;
    // draftFor and userMerges captured by reference are fine here — the
    // memo recomputes whenever any of the deps below change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNewHeaders, newFieldDrafts, columnValues, userMerges]);

  // A choice header needs explicit confirmation when its distinct count
  // exceeds the cardinality threshold and the user hasn't ticked the
  // "yes, really" box.
  const choiceNeedsConfirm = (h: string) => {
    const a = choiceAnalyses[h];
    return Boolean(a && a.options.length > CHOICE_HIGH_CARDINALITY && !confirmHigh[h]);
  };
  const unresolvedChoiceHeaders = selectedNewHeaders.filter(choiceNeedsConfirm);

  function mergePair(header: string, from: string, into: string) {
    setUserMerges((prev) => ({
      ...prev,
      [header]: { ...(prev[header] ?? {}), [from]: into },
    }));
  }
  function unmergePair(header: string, from: string) {
    setUserMerges((prev) => {
      const next = { ...(prev[header] ?? {}) };
      delete next[from];
      return { ...prev, [header]: next };
    });
  }

  function handleImport() {
    if (!file) return;
    if (!importName.trim()) return;
    const newFields = selectedNewHeaders.map((h) => {
      const d = draftFor(h);
      const base = { header: h, label: d.label.trim() || h, type: d.type };
      if (isChoiceType(d.type)) {
        const a = choiceAnalyses[h];
        return { ...base, options: a?.options ?? [], valueMap: a?.valueMap ?? {} };
      }
      return base;
    });
    const fd = new FormData();
    fd.set("file", file);
    fd.set("importName", importName.trim());
    fd.set("mode", importMode);
    fd.set("mapping", JSON.stringify(mapping));
    fd.set("newFields", JSON.stringify(newFields));
    if (newFields.length > 0) fd.set("adminPassword", adminPassword);
    startTransition(async () => {
      try {
        const next = await importCandidatesWithMapping(fd);
        setResult(next);
        // After a successful run, persist the mapping for this header set
        // so the next teammate inherits the same field pairings.
        if (next.status === "success" && headers.length > 0) {
          try {
            await saveImportMapping(headers, {
              mapping,
              newFieldDrafts,
              userMerges,
              confirmHigh,
            });
          } catch {
            // Non-fatal — the import succeeded.
          }
        }
      } catch (error) {
        setResult({
          ...initialImportResult,
          status: "error",
          message: error instanceof Error ? error.message : "Could not import. Try again.",
        });
      }
    });
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="mapImportName">
            Name this import <span className="text-red-500">*</span>
          </label>
          <input
            id="mapImportName"
            type="text"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            maxLength={200}
            disabled={pending}
            placeholder="e.g. LinkedIn export — May 2026"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <p className="mt-1 text-xs text-zinc-500">
            A label for this batch. We record it with who imported and when.
          </p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="mapfile">
            CSV file (any column layout)
          </label>
          <FileDropzone
            id="mapfile"
            file={file}
            onFileChange={onFileSelected}
            disabled={pending}
            hint={`CSV up to ${formatBytes(MAX_CSV_BYTES)} / ${MAX_ROWS_PER_IMPORT.toLocaleString()} rows`}
          />
          <p className="mt-2 text-xs text-zinc-500">
            We&apos;ll read the column names and try to match them to candidate fields automatically.
            Adjust any that are wrong below.
          </p>
        </div>
        {parseError && <p className="text-sm text-red-600 dark:text-red-400">{parseError}</p>}
      </div>

      {restoredFrom && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm dark:border-indigo-900/60 dark:bg-indigo-950/30">
          <span className="text-indigo-800 dark:text-indigo-200">
            Restored a previously-saved mapping for these columns
            {restoredFrom.savedByName ? ` (last saved by ${restoredFrom.savedByName}` : " ("}
            {" on "}
            {new Date(restoredFrom.savedAt).toLocaleDateString()}).
          </span>
          <button
            type="button"
            onClick={handleResetSavedMapping}
            className="rounded-md border border-indigo-300 px-2 py-1 text-xs hover:bg-white dark:border-indigo-700 dark:hover:bg-indigo-950/60"
          >
            Reset to auto-match
          </button>
        </div>
      )}

      {headers.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Field mapping</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {mappedCount} of {IMPORT_FIELDS.length} fields mapped · {headers.length} columns in file
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMapping(autoMatchFields(headers))}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Re-run auto-match
            </button>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium w-[34%]">Candidate field</th>
                <th className="px-4 py-2 font-medium w-[33%]">Your column</th>
                <th className="px-4 py-2 font-medium">Preview (row 1)</th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_FIELDS.map((field) => {
                const value = mapping[field.key] ?? null;
                const isRequired = REQUIRED.has(field.key);
                const unmet = isRequired && !value;
                const preview = value ? previewRow[value] ?? "" : "";
                return (
                  <tr
                    key={field.key}
                    className={`border-t border-zinc-200 dark:border-zinc-800 ${
                      unmet ? "bg-red-50/50 dark:bg-red-950/20" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 align-top">
                      <div className="font-medium">
                        {field.label}
                        {isRequired && <span className="text-red-600 ml-0.5">*</span>}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-mono">{field.key}</div>
                      {field.hint && (
                        <div className="text-[11px] text-zinc-400 mt-0.5">{field.hint}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <HeaderCombobox
                        value={value}
                        headers={headers}
                        required={isRequired}
                        unmet={unmet}
                        onChange={(v) => setFieldMap(field.key, v ?? SKIP)}
                      />
                    </td>
                    <td className="px-4 py-2.5 align-top text-zinc-500 text-xs">
                      <span className="line-clamp-2 break-words">{preview || "—"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {unmatchedHeaders.length > 0 && (
            <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
              <h3 className="text-sm font-semibold">Unmatched columns ({unmatchedHeaders.length})</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                These columns weren&apos;t matched to a candidate field. Tick any you want to capture as a
                new custom field on every imported candidate.
              </p>
              <div className="mt-3 space-y-2">
                {unmatchedHeaders.map((h) => {
                  const d = draftFor(h);
                  const analysis = d.create && isChoiceType(d.type) ? choiceAnalyses[h] : undefined;
                  const overThreshold = Boolean(analysis && analysis.options.length > CHOICE_HIGH_CARDINALITY);
                  return (
                    <div
                      key={h}
                      className="flex flex-col gap-2 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={d.create}
                            onChange={(e) => updateDraft(h, { create: e.target.checked })}
                            className="rounded border-zinc-300 dark:border-zinc-700"
                          />
                          <span className="font-mono text-xs">{h}</span>
                        </label>
                        {d.create && existingMatchFor(h) && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                            title="A custom field with this key already exists — values will go into it (no new field created)."
                          >
                            → existing: {existingMatchFor(h)}
                          </span>
                        )}
                        {d.create && (
                          <>
                            <input
                              value={d.label}
                              onChange={(e) => updateDraft(h, { label: e.target.value })}
                              placeholder="Field label"
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            />
                            <select
                              value={d.type}
                              onChange={(e) => updateDraft(h, { type: e.target.value as CustomFieldType })}
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                            >
                              {NEW_FIELD_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {CUSTOM_FIELD_TYPE_LABEL[t]}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        <span className="ml-auto max-w-[40%] truncate text-xs text-zinc-400">
                          {previewRow[h] || "—"}
                        </span>
                      </div>

                      {analysis && (
                        <div className="ml-6 rounded-md border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs dark:border-indigo-900/40 dark:bg-indigo-950/20">
                          <div className="text-zinc-600 dark:text-zinc-300">
                            <span className="font-medium">{analysis.options.length}</span> distinct option
                            {analysis.options.length === 1 ? "" : "s"} found
                            {analysis.distinct.length !== analysis.options.length &&
                              ` (merged from ${analysis.distinct.length})`}
                            :{" "}
                            <span className="text-zinc-500">
                              {analysis.options.slice(0, 8).join(", ")}
                              {analysis.options.length > 8 ? `, … (+${analysis.options.length - 8})` : ""}
                            </span>
                          </div>

                          {overThreshold && (
                            <label className="mt-2 inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                              <input
                                type="checkbox"
                                checked={Boolean(confirmHigh[h])}
                                onChange={(e) =>
                                  setConfirmHigh((p) => ({ ...p, [h]: e.target.checked }))
                                }
                                className="rounded border-amber-400"
                              />
                              <span>
                                {analysis.options.length} options is a lot — yes, I really want this as a{" "}
                                {d.type === CustomFieldType.MULTI_SELECT ? "Multi" : "Single"} choice
                              </span>
                            </label>
                          )}

                          {analysis.cluster.nearDuplicates.length > 0 && (
                            <div className="mt-2">
                              <div className="mb-1 text-zinc-600 dark:text-zinc-300">
                                Possibly the same — review {analysis.cluster.nearDuplicates.length}{" "}
                                pair{analysis.cluster.nearDuplicates.length === 1 ? "" : "s"}:
                              </div>
                              <ul className="space-y-1">
                                {analysis.cluster.nearDuplicates.map(({ left, right }) => {
                                  // Determine current state: merged into something or kept separate.
                                  const merged = userMerges[h] ?? {};
                                  const rightMergedIntoLeft = merged[right] === left;
                                  const leftMergedIntoRight = merged[left] === right;
                                  return (
                                    <li
                                      key={`${left}::${right}`}
                                      className="flex flex-wrap items-center gap-2"
                                    >
                                      <span className="font-mono">&ldquo;{left}&rdquo;</span>
                                      <span className="text-zinc-400">vs</span>
                                      <span className="font-mono">&ldquo;{right}&rdquo;</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          rightMergedIntoLeft
                                            ? unmergePair(h, right)
                                            : mergePair(h, right, left)
                                        }
                                        className={`rounded border px-2 py-0.5 text-[11px] ${
                                          rightMergedIntoLeft
                                            ? "border-indigo-500 bg-indigo-600 text-white"
                                            : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                                        }`}
                                        title={`Merge "${right}" into "${left}"`}
                                      >
                                        → keep &ldquo;{left}&rdquo;
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          leftMergedIntoRight
                                            ? unmergePair(h, left)
                                            : mergePair(h, left, right)
                                        }
                                        className={`rounded border px-2 py-0.5 text-[11px] ${
                                          leftMergedIntoRight
                                            ? "border-indigo-500 bg-indigo-600 text-white"
                                            : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-800"
                                        }`}
                                        title={`Merge "${left}" into "${right}"`}
                                      >
                                        → keep &ldquo;{right}&rdquo;
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {needsPassword && (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
                  <label className="mb-1 block text-xs font-medium" htmlFor="adminpw">
                    Admin password — required to create {actuallyNewHeaders.length} new field
                    {actuallyNewHeaders.length === 1 ? "" : "s"}
                  </label>
                  <input
                    id="adminpw"
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Your account password"
                    className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm md:max-w-xs dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Only admins can add fields. New fields appear in Settings → Custom fields afterward.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
            <div className="text-xs">
              {missingRequired.length > 0 ? (
                <span className="text-red-600 dark:text-red-400">
                  Map required field{missingRequired.length === 1 ? "" : "s"}:{" "}
                  {missingRequired
                    .map((k) => IMPORT_FIELDS.find((f) => f.key === k)?.label ?? k)
                    .join(", ")}
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">
                  Required fields mapped — ready to import.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={
                pending ||
                !importName.trim() ||
                missingRequired.length > 0 ||
                passwordMissing ||
                unresolvedChoiceHeaders.length > 0
              }
              title={
                !importName.trim()
                  ? "Name this import before continuing"
                  : passwordMissing
                    ? "Enter your admin password to create the new fields"
                    : unresolvedChoiceHeaders.length > 0
                      ? `Confirm high-cardinality choice fields: ${unresolvedChoiceHeaders.join(", ")}`
                      : undefined
              }
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending
                ? "Importing…"
                : needsPassword
                  ? `Create ${actuallyNewHeaders.length} field${actuallyNewHeaders.length === 1 ? "" : "s"} & import`
                  : "Import with this mapping"}
            </button>
          </div>
        </div>
      )}

      {result.message && (
        <p
          className={`text-sm ${
            result.status === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"
          }`}
          aria-live="polite"
        >
          {result.message}
        </p>
      )}

      <ImportResults result={result} />
    </div>
  );
}

/**
 * Searchable file-column picker. Click to open a text box that filters the
 * file's headers as you type (e.g. "phone" narrows to phone-ish columns),
 * plus a Skip option to clear the mapping. Replaces a long native <select>.
 */
function HeaderCombobox({
  value,
  headers,
  required,
  unmet,
  onChange,
}: {
  value: string | null;
  headers: string[];
  required: boolean;
  unmet: boolean;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? headers.filter((h) => h.toLowerCase().includes(q)) : headers;

  function choose(v: string | null) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-md border bg-white px-2 py-1.5 text-left text-sm dark:bg-zinc-950 ${
          unmet ? "border-red-400 dark:border-red-700" : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <span className={value ? "" : "text-zinc-400"}>
          {value ?? (required ? "— Select column —" : "— Skip —")}
        </span>
        <span aria-hidden="true" className="text-zinc-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") {
                e.preventDefault();
                if (filtered.length > 0) choose(filtered[0]);
              }
            }}
            placeholder="Type to filter columns…"
            className="w-full border-b border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-zinc-700"
          />
          <ul className="max-h-56 overflow-auto py-1 text-sm">
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(null)}
                className="block w-full px-2 py-1.5 text-left text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                — Skip —
              </button>
            </li>
            {filtered.map((h) => (
              <li key={h}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(h)}
                  className={`block w-full px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                    h === value ? "bg-indigo-50 font-medium dark:bg-indigo-950/40" : ""
                  }`}
                >
                  {h}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-1.5 text-zinc-400">No columns match &ldquo;{query}&rdquo;.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
