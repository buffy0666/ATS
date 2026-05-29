"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteUser, resetUserPassword } from "./actions";

/**
 * Inline Edit / Reset / Delete buttons for a row in the users table.
 *
 *  - Edit:   jumps to /users/[id] (role change + reset + delete).
 *  - Reset:  flips the cell into a small password input + Save/Cancel.
 *            Calls resetUserPassword directly, so admins don't have to
 *            navigate away just to set a new password.
 *  - Delete: confirm() + deleteUser. Hidden on your own row to prevent
 *            self-deletion (matches the /users/[id] Danger zone rule).
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
  const [mode, setMode] = useState<"idle" | "resetting">("idle");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  function startReset() {
    setMode("resetting");
    setPassword("");
    setError(null);
    setSavedNote(null);
  }

  function cancelReset() {
    setMode("idle");
    setPassword("");
    setError(null);
  }

  function saveReset() {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const fd = new FormData();
    fd.set("password", password);
    startTransition(async () => {
      const res = await resetUserPassword(userId, undefined, fd);
      if (res.ok) {
        setMode("idle");
        setPassword("");
        setSavedNote("Password reset");
        // Briefly show the confirmation, then clear it.
        setTimeout(() => setSavedNote(null), 2500);
      } else {
        setError(res.error);
      }
    });
  }

  if (mode === "resetting") {
    return (
      <div className="flex items-center gap-2 justify-end flex-wrap">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (8+ chars)"
          autoFocus
          autoComplete="new-password"
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveReset();
            } else if (e.key === "Escape") {
              cancelReset();
            }
          }}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs w-44"
        />
        <button
          type="button"
          onClick={saveReset}
          disabled={pending || password.length < 8}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancelReset}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
        {error && (
          <span className="text-xs text-red-600 dark:text-red-400 basis-full text-right">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      {savedNote && (
        <span className="text-xs text-emerald-700 dark:text-emerald-300">{savedNote}</span>
      )}
      <Link
        href={`/users/${userId}`}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={startReset}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900"
        title={`Reset password for ${email}`}
      >
        Reset
      </button>
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
