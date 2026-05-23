"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCandidateToJob } from "../actions";

type Option = { id: string; firstName: string; lastName: string; email: string };

export function AddCandidateForm({
  jobId,
  candidates,
}: {
  jobId: string;
  candidates: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No more candidates to add.{" "}
        <a href="/candidates/new" className="underline">
          Create one
        </a>
        .
      </p>
    );
  }

  return (
    <form
      action={(formData) => {
        const candidateId = formData.get("candidateId") as string;
        if (!candidateId) return;
        startTransition(async () => {
          await addCandidateToJob(jobId, candidateId);
          router.refresh();
        });
      }}
      className="flex items-center gap-2"
    >
      <select
        name="candidateId"
        required
        defaultValue=""
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Add candidate…
        </option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.firstName} {c.lastName} ({c.email})
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
