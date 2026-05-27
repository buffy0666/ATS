"use client";

import { useRef, useState, useTransition } from "react";
import { importCandidatesCsv } from "./actions";
import { ImportResults } from "./ImportResults";
import { initialImportResult, type ImportResult } from "./import-types";

/** Template flow: upload a CSV whose headers already match the template. */
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
            CSV file (template format)
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

      <ImportResults result={result} />
    </>
  );
}
