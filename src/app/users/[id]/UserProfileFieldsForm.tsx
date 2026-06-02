"use client";

import { useActionState } from "react";
import { updateUserProfileFields, type ActionResult } from "../actions";
import { PHONE_SYSTEM_OPTIONS } from "../user-fields";

export type UserProfileFieldValues = {
  technologyComments: string | null;
  phoneSystems: string[];
  phoneNumber: string | null;
  technologyNotes: string | null;
  profileComments: string | null;
};

const textareaClass =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium mb-1";

export function UserProfileFieldsForm({
  userId,
  values,
}: {
  userId: string;
  values: UserProfileFieldValues;
}) {
  const action = updateUserProfileFields.bind(null, userId);
  const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
    action,
    undefined,
  );

  const selected = new Set(values.phoneSystems);

  return (
    <form action={formAction} className="space-y-6">
      {/* Technology */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Technology</h2>

        <div>
          <label htmlFor="technologyComments" className={labelClass}>
            Comments
          </label>
          <textarea
            id="technologyComments"
            name="technologyComments"
            rows={3}
            defaultValue={values.technologyComments ?? ""}
            className={textareaClass}
          />
        </div>

        <fieldset>
          <legend className={labelClass}>Phone system</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {PHONE_SYSTEM_OPTIONS.map((opt) => (
              <label key={opt} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="phoneSystems"
                  value={opt}
                  defaultChecked={selected.has(opt)}
                  className="rounded border-zinc-300 dark:border-zinc-700"
                />
                {opt}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="phoneNumber" className={labelClass}>
            Phone number
          </label>
          <input
            id="phoneNumber"
            name="phoneNumber"
            type="text"
            defaultValue={values.phoneNumber ?? ""}
            placeholder="e.g. +1 (555) 123-4567"
            className={textareaClass}
          />
        </div>

        <div>
          <label htmlFor="technologyNotes" className={labelClass}>
            Comments (second)
          </label>
          <textarea
            id="technologyNotes"
            name="technologyNotes"
            rows={3}
            defaultValue={values.technologyNotes ?? ""}
            className={textareaClass}
          />
        </div>
      </section>

      {/* User Profile */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">User Profile</h2>

        <div>
          <label htmlFor="profileComments" className={labelClass}>
            Comments
          </label>
          <textarea
            id="profileComments"
            name="profileComments"
            rows={3}
            defaultValue={values.profileComments ?? ""}
            className={textareaClass}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
        {state && state.ok && <p className="text-sm text-emerald-600">Saved.</p>}
      </div>
    </form>
  );
}
