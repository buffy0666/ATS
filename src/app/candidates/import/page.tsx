import Link from "next/link";
import { ImportTabs } from "./ImportTabs";

// Bulk imports run server actions inside this route's function. Vercel
// Pro lets us extend the default ~60s ceiling up to 300s so a single
// run can chew through more rows before timing out.
export const maxDuration = 300;

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

      <ImportTabs />
    </main>
  );
}
