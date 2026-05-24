"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCandidateResume } from "../actions";

/**
 * Compact resume upload button that lives in the candidate detail page header.
 *
 * "Replace resume" if one already exists, "Upload resume" if not. Picks the
 * file via a hidden <input type="file"> so the trigger button can be styled
 * however we like.
 */
export function ResumeUploadButton({
  candidateId,
  hasExistingResume,
}: {
  candidateId: string;
  hasExistingResume: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function pickFile() {
    setError(null);
    fileInputRef.current?.click();
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Always clear the input value so picking the same filename twice still
    // fires onChange — common when iterating on a parse.
    event.target.value = "";
    if (!file) return;

    if (hasExistingResume) {
      if (!confirm("Replace the existing resume? The current file will be overwritten.")) {
        return;
      }
    }

    const formData = new FormData();
    formData.set("resume", file);

    startTransition(async () => {
      const result = await updateCandidateResume(candidateId, formData);
      if (result.ok) {
        // Server already revalidated; nudge the router so the iframe re-fetches.
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onFileChosen}
        className="hidden"
      />
      <button
        type="button"
        onClick={pickFile}
        disabled={pending}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending
          ? "Uploading…"
          : hasExistingResume
            ? "Replace resume"
            : "Upload resume"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
