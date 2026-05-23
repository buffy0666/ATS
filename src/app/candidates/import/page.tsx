import Link from "next/link";
import { CSV_HEADERS } from "./columns";
import { ImportForm } from "./ImportForm";

export default function ImportCandidatesPage() {
  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <Link href="/candidates" className="text-sm text-zinc-500 hover:underline">
        ← All candidates
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">Import candidates</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Upload a CSV to create candidates in bulk. Existing candidates (matched by email) are
        skipped — they aren&apos;t overwritten.
      </p>

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
    </main>
  );
}
