"use client";

import { useActionState } from "react";
import { createUser, type ActionResult } from "../actions";

const initialState: ActionResult | undefined = undefined;

export function NewUserForm() {
  const [state, action, pending] = useActionState(createUser, initialState);

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
    >
      <Field label="Email" name="email" type="email" required autoComplete="off" />
      <Field label="Name" name="name" autoComplete="off" />
      <Field
        label="Temporary password (min 8 chars)"
        name="password"
        type="password"
        required
        autoComplete="new-password"
      />
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
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="sendWelcomeEmail"
          defaultChecked
          className="mt-1 rounded border-zinc-300 dark:border-zinc-700"
        />
        <span>
          <span className="font-medium">Send welcome email</span>
          <span className="block text-xs text-zinc-500">
            Emails the user their login URL and the temporary password. Logged on their record.
          </span>
        </span>
      </label>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
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
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
      />
    </div>
  );
}
