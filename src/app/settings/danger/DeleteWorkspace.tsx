"use client";

import { useActionState, useState } from "react";
import { deleteWorkspace } from "./actions";

type ImpactRow = { label: string; count: number };

/**
 * Type-to-confirm workspace deletion. The destructive button stays disabled
 * until the typed value exactly matches the workspace name — and the server
 * action re-checks it, so this is a UX guard, not the security boundary.
 */
export function DeleteWorkspace({
  orgName,
  impact,
}: {
  orgName: string;
  impact: ImpactRow[];
}) {
  const [state, formAction, pending] = useActionState(deleteWorkspace, undefined);
  const [typed, setTyped] = useState("");

  const matches = typed.trim() === orgName.trim();
  const total = impact.reduce((sum, r) => sum + r.count, 0);

  return (
    <section className="mt-6 rounded-lg border border-red-300 bg-red-50/50 p-5 dark:border-red-900/60 dark:bg-red-950/20">
      <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
        Delete this workspace
      </h3>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
        Permanently deletes <span className="font-semibold">{orgName}</span> and{" "}
        <span className="font-semibold">everything in it</span>. This cannot be undone, and there is
        no backup or grace period.
      </p>

      <div className="mt-4 rounded-md border border-red-200 bg-white p-3 dark:border-red-900/50 dark:bg-zinc-900">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          What will be destroyed
        </p>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {impact.map((r) => (
            <li key={r.label} className="flex items-baseline justify-between gap-2">
              <span className="text-zinc-600 dark:text-zinc-400">{r.label}</span>
              <span className="font-semibold tabular-nums">{r.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-red-700 dark:text-red-400">
          Every team member (including you) will be signed out and their account removed. You will be
          returned to the login screen.
        </p>
      </div>

      <form action={formAction} className="mt-4">
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-700 dark:text-zinc-300">
            Type <span className="font-mono font-semibold">{orgName}</span> to confirm
          </span>
          <input
            name="confirmName"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={orgName}
            className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        {state && !state.ok && state.error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={!matches || pending}
          className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending
            ? "Deleting…"
            : `Permanently delete workspace${total > 0 ? ` and ${total.toLocaleString()} records` : ""}`}
        </button>
      </form>
    </section>
  );
}
