"use client";

import { useTransition } from "react";
import { deleteUser } from "../actions";

export function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Permanently delete ${email}? This cannot be undone.`)) return;
        startTransition(() => deleteUser(userId));
      }}
      className="rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-red-950/30 text-red-700 dark:text-red-300 px-3 py-2 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete user"}
    </button>
  );
}
