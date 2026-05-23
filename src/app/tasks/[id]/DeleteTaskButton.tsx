"use client";

import { useTransition } from "react";
import { deleteTask } from "../actions";

export function DeleteTaskButton({ taskId, taskName }: { taskId: string; taskName: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Delete "${taskName}"? This also removes its attachments.`)) return;
    startTransition(() => deleteTask(taskId));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
    >
      {isPending ? "Deleting..." : "Delete task"}
    </button>
  );
}
