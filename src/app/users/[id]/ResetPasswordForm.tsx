"use client";

import { useActionState } from "react";
import { resetUserPassword, type ActionResult } from "../actions";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const action = resetUserPassword.bind(null, userId);
  const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {state && state.ok && <p className="text-sm text-emerald-600">Password updated.</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Updating…" : "Reset password"}
      </button>
    </form>
  );
}
