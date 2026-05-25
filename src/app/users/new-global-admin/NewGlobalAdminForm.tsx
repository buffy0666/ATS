"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  createGlobalAdminAction,
  type CreateGlobalAdminResult,
} from "../actions";

export function NewGlobalAdminForm() {
  const [state, action, pending] = useActionState<
    CreateGlobalAdminResult | undefined,
    FormData
  >(createGlobalAdminAction, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          Global admin created.
        </h2>
        <p className="text-sm text-emerald-900 dark:text-emerald-200">
          {state.email} is now a platform admin. Send them the password you set,
          via a secure channel (1Password share, Signal, etc.). They need to
          sign in once to see the Platform sidebar.
        </p>
        <div className="flex gap-3 text-sm">
          <Link
            href="/users/new-global-admin"
            className="text-zinc-900 dark:text-zinc-100 font-medium hover:underline"
          >
            Create another →
          </Link>
          <Link
            href="/users"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            Back to users
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
    >
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="off"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          maxLength={120}
          autoComplete="off"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="password">
          Temporary password
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
        <p className="mt-1 text-xs text-zinc-500">
          Minimum 10 characters. Share securely; they should change it on first
          sign-in.
        </p>
      </div>

      {state && !state.ok && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-purple-700 hover:bg-purple-800 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create global admin"}
      </button>
    </form>
  );
}
