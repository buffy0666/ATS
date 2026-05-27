"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import {
  createTokenAction,
  revokeTokenAction,
  type CreateTokenResult,
} from "./actions";

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  // Only populated when an admin is viewing every token in the org.
  ownerName?: string | null;
  ownerEmail?: string;
};

export function TokensTable({
  tokens,
  showOwner = false,
}: {
  tokens: TokenRow[];
  // When true, render an "Owner" column — used on the admin console where a
  // single admin sees every member's tokens.
  showOwner?: boolean;
}) {
  const [state, action, pending] = useActionState<CreateTokenResult | undefined, FormData>(
    createTokenAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold mb-3">Create a new token</h2>
        <form
          ref={formRef}
          action={action}
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            // Reset the form after a successful create so the new token banner is the focus.
            setTimeout(() => formRef.current?.reset(), 0);
            // Don't preventDefault — let the form action run.
            void e;
          }}
        >
          <div className="flex-1 min-w-60">
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1" htmlFor="name">
              Token name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="e.g. Chrome extension on laptop"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Generating…" : "Generate token"}
          </button>
        </form>

        {state?.ok === false && (
          <p className="mt-3 text-sm text-red-600">{state.error}</p>
        )}
        {state?.ok === true && <NewTokenBanner token={state.token} name={state.name} />}
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              {showOwner && <th className="px-4 py-2 font-medium">Owner</th>}
              <th className="px-4 py-2 font-medium">Prefix</th>
              <th className="px-4 py-2 font-medium">Last used</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium w-24"></th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={showOwner ? 6 : 5} className="px-4 py-8 text-center text-zinc-500">
                  No active tokens. Generate one above.
                </td>
              </tr>
            )}
            {tokens.map((t) => (
              <tr key={t.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                {showOwner && (
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 break-all">
                    {t.ownerName ?? t.ownerEmail ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{t.tokenPrefix}…</td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                  {new Date(t.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={revokingId === t.id}
                    onClick={() => {
                      if (!confirm(`Revoke "${t.name}"? Any extensions or scripts using it will stop working.`)) return;
                      setRevokingId(t.id);
                      startTransition(async () => {
                        await revokeTokenAction(t.id);
                        setRevokingId(null);
                      });
                    }}
                    className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs disabled:opacity-50"
                  >
                    {revokingId === t.id ? "Revoking…" : "Revoke"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function NewTokenBanner({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 rounded-lg border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            New token: {name}
          </div>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
            Copy it now — you won&apos;t see it again. Paste into the Chrome extension or wherever
            you need it.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(token);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // ignore
            }
          }}
          className="rounded-md bg-emerald-700 dark:bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-emerald-800 dark:hover:bg-emerald-700"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <input
        readOnly
        value={token}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        className="mt-3 w-full rounded-md border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs font-mono"
      />
    </div>
  );
}
