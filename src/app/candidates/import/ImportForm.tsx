"use client";

import { useState, useTransition } from "react";
import { importCandidatesCsv } from "./actions";
import { FileDropzone } from "./FileDropzone";
import { ImportResults } from "./ImportResults";
import { initialImportResult, type ImportMode, type ImportResult } from "./import-types";
import { MAX_CSV_BYTES, MAX_ROWS_PER_IMPORT, formatBytes } from "./limits";

/** Template flow: upload a CSV whose headers already match the template. */
export function ImportForm({ importMode = "create" }: { importMode?: ImportMode }) {
  const [result, setResult] = useState<ImportResult>(initialImportResult);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);

  const tooLarge = Boolean(file && file.size > MAX_CSV_BYTES);

  async function handleSubmit(formData: FormData) {
    // Guard against an oversized upload BEFORE the server action POST —
    // Next.js rejects too-large action bodies with an opaque "unexpected
    // response" framework error that would mask our own size check.
    const f = formData.get("file");
    if (f instanceof File && f.size > MAX_CSV_BYTES) {
      setResult({
        ...initialImportResult,
        status: "error",
        message: `File is too large (${formatBytes(f.size)}). Max is ${formatBytes(MAX_CSV_BYTES)} per import — split it (up to ${MAX_ROWS_PER_IMPORT.toLocaleString()} rows per file) and try again.`,
      });
      return;
    }
    startTransition(async () => {
      try {
        const next = await importCandidatesCsv(formData);
        setResult(next);
        if (next.status === "success") {
          setFile(null);
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
        action={handleSubmit}
        className="mt-6 space-y-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <input type="hidden" name="mode" value={importMode} />
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="importName">
            Name this import <span className="text-red-500">*</span>
          </label>
          <input
            id="importName"
            name="importName"
            type="text"
            required
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
          <label className="mb-2 block text-sm font-medium" htmlFor="file">
            CSV file (template format)
          </label>
          <FileDropzone
            id="file"
            name="file"
            file={file}
            onFileChange={(f) => {
              setFile(f);
              // Clear any previous error message when picking a new file.
              if (result.message) setResult(initialImportResult);
            }}
            disabled={pending}
            hint={`CSV up to ${formatBytes(MAX_CSV_BYTES)} / ${MAX_ROWS_PER_IMPORT.toLocaleString()} rows`}
          />
          {tooLarge && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              File is {formatBytes(file!.size)} — max is {formatBytes(MAX_CSV_BYTES)}. Split it into smaller files (up to {MAX_ROWS_PER_IMPORT.toLocaleString()} rows each) and try again.
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending || !file || tooLarge}
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

      <ImportResults result={result} />
    </>
  );
}
