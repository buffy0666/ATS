"use client";

import Link from "next/link";
import { useTransition } from "react";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/template-renderer";

type Defaults = { name?: string; subject?: string; body?: string };

export function TemplateForm({
  action,
  defaults,
  submitLabel = "Save",
  cancelHref = "/templates",
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaults?: Defaults;
  submitLabel?: string;
  cancelHref?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => startTransition(() => Promise.resolve(action(fd)))}
      className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
    >
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="name">
          Template name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={defaults?.name}
          placeholder="e.g. Phone screen invitation"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          name="subject"
          required
          defaultValue={defaults?.subject}
          placeholder="{{job.title}} — quick chat?"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="body">
          Body
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={12}
          defaultValue={defaults?.body}
          placeholder={"Hi {{candidate.firstName}},\n\nI'm reaching out about the {{job.title}} role…\n\nBest,\n{{sender.name}}"}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
        />
      </div>

      <div className="rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 text-xs">
        <div className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Available placeholders</div>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_PLACEHOLDERS.map((p) => (
            <code key={p} className="font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5">
              {`{{${p}}}`}
            </code>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
