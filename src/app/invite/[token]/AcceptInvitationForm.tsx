"use client";

import { useActionState } from "react";
import { acceptInvitationAction, type AcceptResult } from "./actions";

const initialState: AcceptResult = { ok: false, error: "" };

export function AcceptInvitationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          readOnly
          defaultValue={email}
          autoComplete="email"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-zinc-500">
          This invitation was sent to {email}. Sign in with this email after
          you set your password.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="password">
          Set a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={200}
          autoComplete="new-password"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
        <p className="mt-1 text-xs text-zinc-500">Minimum 10 characters.</p>
      </div>

      {!state.ok && state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Setting up account…" : "Accept invitation"}
      </button>
    </form>
  );
}
