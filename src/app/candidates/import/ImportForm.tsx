"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toCsv } from "@/lib/csv";
import { importCandidatesCsv } from "./actions";
import { initialImportResult, type ImportResult, type RowResult } from "./import-types";

export function ImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ImportResult>(initialImportResult);
  const [pending, startTransition] = useTransition();
  const [fileSelected, setFileSelected] = useState(false);

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const next = await importCandidatesCsv(formData);
        setResult(next);
        if (next.status === "success") {
          formRef.current?.reset();
          setFileSelected(false);
        }
      } catch (error) {
        setResult({
          ...initialImportResult,
          status: "error",
          message:
            error instanceof Error ? error.message : "Could not import this CSV. Try again.",
        });
      }
    });
  }

  return (
    <>
      <form
        ref={formRef}
        action={handleSubmit}
        className="mt-6 space-y-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="file">
            CSV file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFileSelected(Boolean(event.target.files?.[0]))}
            className="block w-full text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !fileSelected}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Importing..." : "Import"}
        </button>
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
      </form>

      {result.rows.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Results
            </h2>
            {result.errored > 0 && (
              <button
                type="button"
                onClick={() => downloadErroredRows(result)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Download {result.errored} errored row{result.errored === 1 ? "" : "s"}
              </button>
            )}
          </div>
          <div className="mb-3 flex gap-4 text-sm">
            <Stat label="Created" value={result.created} tone="ok" />
            <Stat label="Skipped" value={result.skipped} tone="muted" />
            <Stat label="Errored" value={result.errored} tone="err" />
          </div>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-950">
                <tr>
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr
                    key={`${r.row}-${r.status}`}
                    className="border-t border-zinc-200 dark:border-zinc-800"
                  >
                    <td className="px-3 py-2 tabular-nums text-zinc-500">{r.row}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {r.email ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {r.status === "created" ? (
                        <Link
                          href={`/candidates/${r.candidateId}`}
                          className="underline"
                        >
                          View candidate
                        </Link>
                      ) : (
                        r.reason
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "muted" | "err";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "err"
        ? "text-red-700 dark:text-red-400"
        : "text-zinc-600 dark:text-zinc-400";
  return (
    <div className="rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function downloadErroredRows(result: ImportResult) {
  const erroredRows = result.rows.filter(
    (r): r is Extract<RowResult, { status: "error" }> => r.status === "error",
  );
  if (erroredRows.length === 0) return;

  const headers = [...result.headers, "_error_row", "_error_reason"];
  const dataRows = erroredRows.map((r) => [
    ...result.headers.map((h) => r.record[h] ?? ""),
    String(r.row),
    r.reason,
  ]);

  const csv = toCsv([headers, ...dataRows]);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `candidate-import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: "created" | "skipped" | "error" }) {
  const cls =
    status === "created"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : status === "skipped"
        ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}
