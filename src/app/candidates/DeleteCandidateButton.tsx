"use client";

import { useTransition } from "react";
import { deleteCandidate } from "./delete-action";

export function DeleteCandidateButton({
  candidateId,
  candidateName,
  applicationCount,
}: {
  candidateId: string;
  candidateName: string;
  applicationCount: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        const warning =
          applicationCount > 0
            ? `Delete ${candidateName}? This also removes ${applicationCount} application${applicationCount === 1 ? "" : "s"} and any notes attached to them. This cannot be undone.`
            : `Delete ${candidateName}? This cannot be undone.`;
        if (!confirm(warning)) return;
        startTransition(() => deleteCandidate(candidateId));
      }}
      className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
      aria-label={`Delete ${candidateName}`}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
