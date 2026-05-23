"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteJob } from "../actions";

export function JobActions({
  jobId,
  jobTitle,
  applicantCount,
}: {
  jobId: string;
  jobTitle: string;
  applicantCount: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/jobs/${jobId}/edit`}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Edit
      </Link>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const warning =
            applicantCount > 0
              ? `Delete "${jobTitle}"? This will also remove ${applicantCount} application${applicantCount === 1 ? "" : "s"} and any notes/emails linked to them. This cannot be undone.`
              : `Delete "${jobTitle}"? This cannot be undone.`;
          if (!confirm(warning)) return;
          startTransition(() => deleteJob(jobId));
        }}
        className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
