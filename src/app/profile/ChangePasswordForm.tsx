"use client";

import { useActionState, useEffect, useRef } from "react";
import { changeMyPassword, type ChangePasswordResult } from "./actions";

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    ChangePasswordResult | undefined,
    FormData
  >(changeMyPassword, undefined);

  // Clear the inputs after a successful change so the form doesn't keep the
  // old/new passwords sitting in the DOM.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4 max-w-md">
      <div>
        <label htmlFor="currentPassword" className="block text-sm font-medium mb-1">
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium mb-1">
          New password
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-zinc-500">At least 8 characters.</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>

      {state && !state.ok && (
        <p className="text-sm text-red-600 dark:text-red-400" aria-live="polite">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" aria-live="polite">
          Password updated. Use it next time you sign in.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}
