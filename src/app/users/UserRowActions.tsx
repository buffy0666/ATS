"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteUser } from "./actions";

/**
 * Inline Edit + Delete buttons for a row in the users table. Edit jumps
 * to /users/[id] where you can change role + reset password + delete.
 * Delete is also exposed inline as a quick shortcut — guarded by a native
 * confirm() because deletion cascades through the user's owned rows.
 */
export function UserRowActions({
  userId,
  email,
  isSelf,
}: {
  userId: string;
  email: string;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 justify-end">
      <Link
        href={`/users/${userId}`}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        Edit
      </Link>
      {!isSelf && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Permanently delete ${email}? This cannot be undone.`)) return;
            startTransition(() => deleteUser(userId));
          }}
          className="rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-red-950/30 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      )}
    </div>
  );
}
