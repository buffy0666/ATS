"use client";

import { useMemo, useState, useTransition } from "react";
import { CustomFieldType } from "@/generated/prisma";
import { CUSTOM_FIELD_TYPE_LABEL } from "@/lib/custom-fields-shared";
import { parseCsv } from "@/lib/csv";
import { importCandidatesWithMapping } from "./actions";
import {
  autoMatchFields,
  IMPORT_FIELDS,
  REQUIRED_FIELD_KEYS,
  type FieldMapping,
} from "./field-catalog";
import { ImportResults } from "./ImportResults";
import { initialImportResult, type ImportResult } from "./import-types";

const SKIP = "__skip__";
const REQUIRED = new Set(REQUIRED_FIELD_KEYS);

// Types offered for auto-created fields — single-value kinds only (SELECT /
// MULTI_SELECT need a predefined option list, so they're set up in Settings).
const NEW_FIELD_TYPES: CustomFieldType[] = [
  CustomFieldType.TEXT,
  CustomFieldType.LONG_TEXT,
  CustomFieldType.NUMBER,
  CustomFieldType.DATE,
  CustomFieldType.BOOLEAN,
  CustomFieldType.URL,
  CustomFieldType.EMAIL,
];

type NewFieldDraft = { create: boolean; label: string; type: CustomFieldType };

/**
 * Field-mapping flow:
 *   1. Pick a file. We read its header row client-side (lib/csv parseCsv)
 *      and auto-match each input column to a candidate field.
 *   2. The mapping table shows existing fields on the left, a dropdown of
 *      the file's columns on the right, with "Skip" for anything unmatched.
 *   3. Import sends the file + the mapping JSON to the server action,
 *      which remaps each row and runs the standard import pipeline.
 */
export function MappingImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRow, setPreviewRow] = useState<Record<string, string>>({});
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [newFieldDrafts, setNewFieldDrafts] = useState<Record<string, NewFieldDraft>>({});
  const [adminPassword, setAdminPassword] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult>(initialImportResult);
  const [pending, startTransition] = useTransition();

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(initialImportResult);
    setParseError(null);
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setHeaders([]);
    setMapping({});
    setNewFieldDrafts({});
    setAdminPassword("");
    setPreviewRow({});
    if (!f) return;

    try {
      const text = await f.text();
      const grid = parseCsv(text);
      if (grid.length < 1 || grid[0].length === 0) {
        setParseError("Couldn't read a header row from this file.");
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
      setMapping(autoMatchFields(hdrs));
    } catch {
      setParseError("Couldn't parse this file as CSV.");
    }
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
  const needsPassword = selectedNewHeaders.length > 0;
  const passwordMissing = needsPassword && !adminPassword.trim();

  function handleImport() {
    if (!file) return;
    const newFields = selectedNewHeaders.map((h) => {
      const d = draftFor(h);
      return { header: h, label: d.label.trim() || h, type: d.type };
    });
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mapping", JSON.stringify(mapping));
    fd.set("newFields", JSON.stringify(newFields));
    if (newFields.length > 0) fd.set("adminPassword", adminPassword);
    startTransition(async () => {
      try {
        const next = await importCandidatesWithMapping(fd);
        setResult(next);
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
          <label className="mb-1 block text-sm font-medium" htmlFor="mapfile">
            CSV file (any column layout)
          </label>
          <input
            id="mapfile"
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className="block w-full text-sm"
          />
          <p className="mt-1 text-xs text-zinc-500">
            We&apos;ll read the column names and try to match them to candidate fields automatically.
            Adjust any that are wrong below.
          </p>
        </div>
        {parseError && <p className="text-sm text-red-600 dark:text-red-400">{parseError}</p>}
      </div>

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
                      <select
                        value={value ?? SKIP}
                        onChange={(e) => setFieldMap(field.key, e.target.value)}
                        className={`w-full rounded-md border bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm ${
                          unmet
                            ? "border-red-400 dark:border-red-700"
                            : "border-zinc-300 dark:border-zinc-700"
                        }`}
                      >
                        <option value={SKIP}>{isRequired ? "— Select column —" : "— Skip —"}</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
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
                  return (
                    <div
                      key={h}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={d.create}
                          onChange={(e) => updateDraft(h, { create: e.target.checked })}
                          className="rounded border-zinc-300 dark:border-zinc-700"
                        />
                        <span className="font-mono text-xs">{h}</span>
                      </label>
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
                  );
                })}
              </div>

              {needsPassword && (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
                  <label className="mb-1 block text-xs font-medium" htmlFor="adminpw">
                    Admin password — required to create {selectedNewHeaders.length} new field
                    {selectedNewHeaders.length === 1 ? "" : "s"}
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
              disabled={pending || missingRequired.length > 0 || passwordMissing}
              title={passwordMissing ? "Enter your admin password to create the new fields" : undefined}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending
                ? "Importing…"
                : needsPassword
                  ? `Create ${selectedNewHeaders.length} field${selectedNewHeaders.length === 1 ? "" : "s"} & import`
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
