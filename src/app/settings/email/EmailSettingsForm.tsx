"use client";

import { useState, useTransition } from "react";
import { setEmailOutDisabled, type SetEmailOutResult } from "./actions";

/**
 * Workspace email kill switch. When ON (disabled), all outbound
 * candidate/contact email from this workspace is blocked at the send layer
 * (composer, sequences, interview emails, AI email tool). Saving candidates
 * from Outlook/Chrome and internal teammate invitations are unaffected.
 */
export function EmailSettingsForm({ initialDisabled }: { initialDisabled: boolean }) {
  const [disabled, setDisabled] = useState(initialDisabled);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SetEmailOutResult | null>(null);

  function toggle(next: boolean) {
    // Disabling is the destructive direction — confirm it.
    if (next && !window.confirm(
      "Disable outbound email for this workspace?\n\n" +
        "While disabled, the composer, sequences, interview emails, and the AI " +
        "email tool will not send. Saving from Outlook and teammate invitations " +
        "are unaffected.",
    )) {
      return;
    }
    setResult(null);
    startTransition(async () => {
      const r = await setEmailOutDisabled(next);
      setResult(r);
      if (r.ok) setDisabled(r.disabled);
    });
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium">Outbound email</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {disabled ? (
              <span className="text-amber-600 dark:text-amber-400">
                Disabled — this workspace cannot send candidate/contact email.
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">
                Enabled — this workspace can send email normally.
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={!disabled}
          disabled={pending}
          onClick={() => toggle(!disabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            disabled ? "bg-zinc-300 dark:bg-zinc-700" : "bg-emerald-500"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              disabled ? "translate-x-0.5" : "translate-x-[1.375rem]"
            }`}
          />
        </button>
      </div>

      <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs text-zinc-500 space-y-1">
        <p>
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Blocked when disabled:</span>{" "}
          candidate composer, sequence emails, interview invitations, AI email tool.
        </p>
        <p>
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Not affected:</span>{" "}
          saving candidates/emails from the Outlook add-in &amp; Chrome extension, and internal
          teammate invitations.
        </p>
      </div>

      {result && !result.ok && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}
      {result && result.ok && (
        <p className="text-sm text-emerald-600">Saved.</p>
      )}
    </div>
  );
}
