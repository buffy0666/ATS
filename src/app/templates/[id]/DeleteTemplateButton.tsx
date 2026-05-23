"use client";

import { useTransition } from "react";
import { deleteTemplate } from "../actions";

export function DeleteTemplateButton({
  templateId,
  templateName,
}: {
  templateId: string;
  templateName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete template "${templateName}"?`)) return;
        startTransition(() => deleteTemplate(templateId));
      }}
      className="rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-red-950/30 text-red-700 dark:text-red-300 px-3 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete template"}
    </button>
  );
}
