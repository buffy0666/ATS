"use client";

import { useActionState } from "react";
import { inviteTeammateAction, type InviteResult } from "../actions";

export function InviteTeammateForm() {
  const [state, action, pending] = useActionState<InviteResult | undefined, FormData>(
    inviteTeammateAction,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {state.emailSent ? "Invitation sent." : "Invitation created (email delivery failed)."}
        </h2>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-zinc-500">Invitee</dt>
            <dd className="font-medium">{state.email}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Magic link</dt>
            <dd className="font-mono text-xs break-all text-zinc-700 dark:text-zinc-300">
              {state.inviteUrl}
            </dd>
            <p className="mt-1 text-xs text-zinc-500">
              {state.emailSent
                ? "Already emailed. Copy/paste here if you want to share via Slack or another channel."
                : "Send this link to them manually — email delivery didn't succeed."}
            </p>
          </div>
        </dl>
        <a
          href="/users/invite"
          className="inline-block text-sm text-zinc-900 dark:text-zinc-100 font-medium hover:underline"
        >
          Invite another →
        </a>
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
        <label className="block text-sm font-medium mb-1" htmlFor="role">
          Role
        </label>
        <select
          id="role"
          name="role"
          defaultValue="RECRUITER"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="RECRUITER">Recruiter — can manage jobs, candidates, and pipelines</option>
          <option value="ADMIN">Admin — full access, including user management</option>
        </select>
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}
