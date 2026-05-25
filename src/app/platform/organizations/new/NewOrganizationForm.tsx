"use client";

import { useActionState } from "react";
import { createTenantAction, type CreateTenantResult } from "./actions";

const initialState: CreateTenantResult = { ok: false, error: "" };

export function NewOrganizationForm() {
  const [state, action, pending] = useActionState(
    createTenantAction,
    initialState,
  );

  if (state.ok) {
    return (
      <div className="space-y-4">
        <h3
          className={`text-sm font-semibold ${
            state.emailSent
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {state.emailSent
            ? "Tenant created and invitation emailed."
            : "Tenant created. Email delivery failed — send the link manually."}
        </h3>
        {!state.emailSent && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Email isn&apos;t configured for this deployment, or the provider
            rejected the send. Set <code>RESEND_API_KEY</code> +{" "}
            <code>EMAIL_FROM</code> (or the Mailgun equivalents) in Vercel
            env, then redeploy. The link below is still valid for 7 days.
          </p>
        )}
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-zinc-500">Organization</dt>
            <dd className="font-medium">{state.organizationName}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Owner invitee</dt>
            <dd className="font-medium">{state.email}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Magic link</dt>
            <dd className="font-mono text-xs break-all text-zinc-700 dark:text-zinc-300 select-all">
              {state.inviteUrl}
            </dd>
            <p className="mt-1 text-xs text-zinc-500">
              {state.emailSent
                ? "Already emailed. Copy/paste here if you want to also share via Slack or another channel."
                : "Send this link to the owner manually — open it in their browser, an incognito window, or via Slack/DM."}
            </p>
          </div>
        </dl>
        <a
          href="/platform/organizations/new"
          className="inline-block text-sm text-zinc-900 dark:text-zinc-100 font-medium hover:underline"
        >
          Create another →
        </a>
      </div>
    );
  }

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
          placeholder="Acme Recruiting"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="ownerEmail">
          Owner email
        </label>
        <input
          id="ownerEmail"
          name="ownerEmail"
          type="email"
          required
          maxLength={200}
          placeholder="owner@example.com"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
        />
        <p className="mt-1 text-xs text-zinc-500">
          They&apos;ll receive a magic link to set their password and become the
          workspace owner + admin.
        </p>
      </div>

      {!state.ok && state.error && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating tenant…" : "Create tenant & send invite"}
      </button>
    </form>
  );
}
