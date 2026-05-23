"use client";

import { useActionState } from "react";
import { sendTestEmail, type SendResult } from "./actions";

export function EmailTestForm({ fromDefault }: { fromDefault: string }) {
  const [state, action, pending] = useActionState<SendResult | undefined, FormData>(
    sendTestEmail,
    undefined,
  );

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
    >
      <Field
        label="To"
        name="to"
        type="email"
        required
        placeholder="you@example.com"
        helper="Until your sending domain is verified in Resend, the recipient must be the email you signed up with."
      />
      <Field
        label="Subject"
        name="subject"
        required
        defaultValue={`ATS test from ${fromDefault.replace(/^.*<|>.*$/g, "")}`}
      />
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="body">
          Body
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          defaultValue={"Hello!\n\nThis is a test email from the ATS via the configured email provider.\n\nIf you got this, the wiring works."}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
        />
      </div>

      {state?.ok === true && (
        <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 px-3 py-2 text-sm">
          Sent via <strong>{state.provider}</strong> — message id{" "}
          <code className="font-mono text-xs">{state.id}</code>
        </div>
      )}
      {state?.ok === false && (
        <div className="rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-3 py-2 text-sm">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send test email"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  placeholder,
  helper,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      />
      {helper && <p className="mt-1 text-xs text-zinc-500">{helper}</p>}
    </div>
  );
}
