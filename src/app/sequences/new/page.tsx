import Link from "next/link";
import { createSequence } from "../actions";
import { SequenceStatus } from "@/generated/prisma";

export default function NewSequencePage() {
  return (
    <main className="flex-1 max-w-xl mx-auto w-full px-6 py-10">
      <Link href="/sequences" className="text-sm text-zinc-500 hover:underline">
        ← All sequences
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">New sequence</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Create the sequence, then add steps on the next page.
      </p>

      <form
        action={createSequence}
        className="mt-6 space-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={160}
            placeholder="e.g. Senior Engineer — Cold Outreach"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="What this sequence is for (optional)…"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={SequenceStatus.ACTIVE}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value={SequenceStatus.ACTIVE}>Active</option>
            <option value={SequenceStatus.ARCHIVED}>Archived</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
        >
          Create sequence
        </button>
      </form>
    </main>
  );
}
