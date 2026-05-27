"use client";

import { useState } from "react";
import { CSV_HEADERS } from "./columns";
import { ImportForm } from "./ImportForm";
import { MappingImportForm } from "./MappingImportForm";

type Mode = "template" | "mapping";

/**
 * Two import paths:
 *   - "Import from template" — exact-header CSV (download the template).
 *   - "Map fields from my file" — any CSV; pair its columns to candidate
 *     fields with auto-match + skip.
 */
export function ImportTabs() {
  const [mode, setMode] = useState<Mode>("template");

  return (
    <div className="mt-6">
      <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-1 bg-zinc-50 dark:bg-zinc-950">
        <ModeButton active={mode === "template"} onClick={() => setMode("template")}>
          Import from template
        </ModeButton>
        <ModeButton active={mode === "mapping"} onClick={() => setMode("mapping")}>
          Map fields from my file
        </ModeButton>
      </div>

      {mode === "template" ? (
        <>
          <section className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">CSV format</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
                  <li>
                    Required columns: <code>firstName</code>, <code>lastName</code>, <code>email</code>.
                  </li>
                  <li>
                    Multi-value fields use <code>|</code> as the separator (e.g.{" "}
                    <code>FULL_TIME|CONTRACT</code>, <code>TypeScript|Postgres</code>).
                  </li>
                  <li>
                    Booleans accept <code>yes/no</code>, <code>true/false</code>, <code>1/0</code>.
                  </li>
                  <li>
                    Dates use <code>YYYY-MM-DD</code>. Enums must match values exactly (e.g.{" "}
                    <code>US_CITIZEN</code>, <code>SENIOR</code>).
                  </li>
                  <li>Columns may appear in any order; unknown columns are ignored.</li>
                </ul>
              </div>
              <a
                href="/candidates/import/template"
                className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
              >
                Download template
              </a>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-zinc-600 hover:underline dark:text-zinc-400">
                Show all {CSV_HEADERS.length} columns
              </summary>
              <p className="mt-2 break-words text-xs text-zinc-500">{CSV_HEADERS.join(", ")}</p>
            </details>
          </section>
          <ImportForm />
        </>
      ) : (
        <>
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            Upload any CSV export — from another ATS, a spreadsheet, LinkedIn, etc. We&apos;ll match
            its columns to candidate fields automatically; you fix anything that&apos;s off and skip
            what you don&apos;t need. Same value formats as the template (pipes for multi-value,
            <code> yes/no</code> for booleans, <code>YYYY-MM-DD</code> for dates).
          </p>
          <MappingImportForm />
        </>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}
