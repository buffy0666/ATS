"use client";

import { useState, useTransition } from "react";
import {
  createChoiceOption,
  deleteChoiceOption,
  renameChoiceOption,
  usageCountForChoice,
  type ChoiceActionResult,
} from "./actions";

export type ChoiceRow = {
  id: string;
  name: string;
  usage: number;
};

export function ChoicesSection({
  fieldKey,
  fieldLabel,
  helper,
  rows,
}: {
  fieldKey: string;
  fieldLabel: string;
  helper: string;
  rows: ChoiceRow[];
}) {
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [createName, setCreateName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  function showResult(r: ChoiceActionResult) {
    setBanner({ tone: r.ok ? "ok" : "err", text: r.message });
    setTimeout(() => setBanner(null), 5000);
  }

  function submitCreate() {
    if (!createName.trim()) return;
    startTransition(async () => {
      const r = await createChoiceOption(fieldKey, createName);
      showResult(r);
      if (r.ok) setCreateName("");
    });
  }

  function startEdit(row: ChoiceRow) {
    setEditingId(row.id);
    setDraftName(row.name);
  }

  function commitEdit(row: ChoiceRow) {
    if (!draftName.trim() || draftName.trim() === row.name) {
      setEditingId(null);
      return;
    }
    startTransition(async () => {
      const r = await renameChoiceOption(row.id, draftName);
      showResult(r);
      if (r.ok) setEditingId(null);
    });
  }

  async function confirmDelete(row: ChoiceRow) {
    // Re-query usage at confirm time so the warning is fresh — the cached
    // count from page render could be stale by the time the user clicks.
    let usage = row.usage;
    try {
      usage = await usageCountForChoice(fieldKey, row.name);
    } catch {
      // fall back to the cached count
    }
    const warning =
      usage > 0
        ? `Delete "${row.name}"? ${usage} candidate${usage === 1 ? "" : "s"} currently use${
            usage === 1 ? "s" : ""
          } this value — they'll be set to empty (as if never selected). Continue?`
        : `Delete "${row.name}"?`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      const r = await deleteChoiceOption(row.id);
      showResult(r);
    });
  }

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 text-left p-5 hover:bg-zinc-50 dark:hover:bg-zinc-950 rounded-lg"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 text-base font-medium leading-none text-zinc-600 dark:text-zinc-300"
        >
          {open ? "−" : "+"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">{fieldLabel}</h2>
            <span className="text-xs text-zinc-500 tabular-nums">
              {rows.length} option{rows.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">{helper}</p>
        </div>
      </button>

      {!open ? null : (
      <div className="px-5 pb-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitCreate();
        }}
        className="mb-4 flex items-end gap-2"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Add option
          </label>
          <input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Type a name and press Add"
            maxLength={80}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !createName.trim()}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {banner && (
        <p
          className={`mb-3 text-sm ${
            banner.tone === "ok"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
          aria-live="polite"
        >
          {banner.text}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No options yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
          {rows.map((row) => {
            const isEditing = editingId === row.id;
            return (
              <li
                key={row.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      value={draftName}
                      autoFocus
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitEdit(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(row);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      maxLength={80}
                      className="w-full max-w-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="text-left rounded px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      title="Click to rename"
                    >
                      {row.name}
                    </button>
                  )}
                </div>
                <div className="text-xs text-zinc-500 tabular-nums shrink-0">
                  {row.usage} record{row.usage === 1 ? "" : "s"}
                </div>
                <button
                  type="button"
                  onClick={() => confirmDelete(row)}
                  disabled={pending}
                  className="shrink-0 rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      )}
      </div>
      )}
    </section>
  );
}
