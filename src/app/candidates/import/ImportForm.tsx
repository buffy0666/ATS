"use client";

import { useState, useTransition } from "react";
import { importCandidatesCsv } from "./actions";
import { FileDropzone } from "./FileDropzone";
import { ImportResults } from "./ImportResults";
import { initialImportResult, type ImportResult } from "./import-types";

/** Template flow: upload a CSV whose headers already match the template. */
export function ImportForm() {
  const [result, setResult] = useState<ImportResult>(initialImportResult);
  const [pending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);

  async function handleSubmit(formData: FormData) {
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
            hint="CSV up to 10 MB"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !file}
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
