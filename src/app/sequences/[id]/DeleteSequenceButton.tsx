"use client";

import { useState } from "react";

export function DeleteSequenceButton({ name }: { name: string }) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (
          !confirm(
            `Delete "${name}"? Any active enrollments will be canceled and scheduled emails will be canceled at Resend.`,
          )
        ) {
          e.preventDefault();
          return;
        }
        setPending(true);
      }}
      className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete sequence"}
    </button>
  );
}
