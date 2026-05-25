"use client";

import { useActionState } from "react";
import { createOrganizationAction, type CreateOrgResult } from "./actions";

const initialState: CreateOrgResult = { ok: false, error: "" };

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(
    createOrganizationAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="organizationName">
          Company / team name
        </label>
        <input
          id="organizationName"
          name="organizationName"
          type="text"
          required
          maxLength={120}
          autoComplete="organization"
          placeholder="Acme Recruiting"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
      </div>

      {!state.ok && state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Create workspace"}
      </button>
    </form>
  );
}
