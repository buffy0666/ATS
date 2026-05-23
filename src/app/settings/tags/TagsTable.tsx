"use client";

import { useState, useTransition } from "react";
import { tagClass } from "@/lib/tag-colors";
import {
  createTag,
  deleteTag,
  renameTag,
  type TagActionResult,
} from "./actions";

export type TagRow = {
  id: string;
  name: string;
  color: string;
  candidateCount: number;
  clientCount: number;
  contactCount: number;
};

export function TagsTable({ tags }: { tags: TagRow[] }) {
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [createName, setCreateName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  function showResult(r: TagActionResult) {
    setBanner({ tone: r.ok ? "ok" : "err", text: r.message });
    setTimeout(() => setBanner(null), 4000);
  }

  function submitCreate() {
    if (!createName.trim()) return;
    const fd = new FormData();
    fd.set("name", createName);
    startTransition(async () => {
      const r = await createTag(fd);
      showResult(r);
      if (r.ok) setCreateName("");
    });
  }

  function startEdit(t: TagRow) {
    setEditingId(t.id);
    setDraftName(t.name);
  }

  function commitEdit(t: TagRow) {
    if (!draftName.trim() || draftName.trim() === t.name) {
      setEditingId(null);
      return;
    }
    startTransition(async () => {
      const r = await renameTag(t.id, draftName);
      showResult(r);
      if (r.ok) setEditingId(null);
    });
  }

  function confirmDelete(t: TagRow) {
    const usage = t.candidateCount + t.clientCount + t.contactCount;
    const warning =
      usage > 0
        ? `Delete "${t.name}"? It's used by ${describeUsage(t)}. Those records won't be deleted — they'll just lose this tag. Continue?`
        : `Delete "${t.name}"?`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      const r = await deleteTag(t.id);
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
            <h2 className="text-lg font-semibold">Tags</h2>
            <span className="text-xs text-zinc-500 tabular-nums">
              {tags.length} tag{tags.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Tags are shared across candidates, clients, and contacts. Deleting a tag untags every
            record it was on — it doesn&apos;t delete the records themselves.
          </p>
        </div>
      </button>

      {!open ? null : (
      <div className="px-5 pb-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitCreate();
        }}
        className="mb-5 flex items-end gap-2"
      >
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium" htmlFor="newTagName">
            New tag
          </label>
          <input
            id="newTagName"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. phone-screen"
            maxLength={60}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !createName.trim()}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add tag
        </button>
      </form>

      {banner && (
        <p
          className={`mb-3 text-sm ${
            banner.tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}
          aria-live="polite"
        >
          {banner.text}
        </p>
      )}

      {tags.length === 0 ? (
        <p className="text-sm text-zinc-500">No tags yet.</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Tag</th>
                <th className="px-4 py-2 font-medium text-right">Candidates</th>
                <th className="px-4 py-2 font-medium text-right">Clients</th>
                <th className="px-4 py-2 font-medium text-right">Contacts</th>
                <th className="px-4 py-2 font-medium w-32"></th>
              </tr>
            </thead>
            <tbody>
              {tags.map((t) => {
                const isEditing = editingId === t.id;
                return (
                  <tr key={t.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          value={draftName}
                          autoFocus
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={() => commitEdit(t)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit(t);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          maxLength={60}
                          className="w-full max-w-xs rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-sm"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(t)}
                          className={`rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)} hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-700`}
                          title="Click to rename"
                        >
                          {t.name}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {t.candidateCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {t.clientCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {t.contactCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => confirmDelete(t)}
                        disabled={pending}
                        className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
      )}
    </section>
  );
}

function describeUsage(t: TagRow): string {
  const parts: string[] = [];
  if (t.candidateCount) parts.push(`${t.candidateCount} candidate${t.candidateCount === 1 ? "" : "s"}`);
  if (t.clientCount) parts.push(`${t.clientCount} client${t.clientCount === 1 ? "" : "s"}`);
  if (t.contactCount) parts.push(`${t.contactCount} contact${t.contactCount === 1 ? "" : "s"}`);
  return parts.join(", ");
}
