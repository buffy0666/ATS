"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createOrgAnnouncement,
  deleteOrgAnnouncement,
  setOrgAnnouncementActive,
  updateOrgAnnouncement,
  type AnnouncementActionResult,
} from "./actions";

export type AnnouncementRow = {
  id: string;
  title: string | null;
  body: string;
  active: boolean;
  createdAt: string;
  createdByName: string | null;
};

export function AnnouncementsList({ rows }: { rows: AnnouncementRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function show(r: AnnouncementActionResult) {
    setBanner({ tone: r.ok ? "ok" : "err", text: r.message });
    setTimeout(() => setBanner(null), 4000);
  }

  function toggleActive(row: AnnouncementRow) {
    startTransition(async () => {
      const r = await setOrgAnnouncementActive(row.id, !row.active);
      show(r);
      if (r.ok) router.refresh();
    });
  }

  function remove(row: AnnouncementRow) {
    if (!confirm("Delete this announcement permanently?")) return;
    startTransition(async () => {
      const r = await deleteOrgAnnouncement(row.id);
      show(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {banner && (
        <p
          className={`text-sm ${
            banner.tone === "ok"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
          aria-live="polite"
        >
          {banner.text}
        </p>
      )}

      {adding ? (
        <AnnouncementForm
          mode="create"
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
          onResult={show}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
        >
          New announcement
        </button>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No workspace announcements yet. Create one to share an update with everyone in your
          org.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const isEditing = editingId === row.id;
            if (isEditing) {
              return (
                <li key={row.id}>
                  <AnnouncementForm
                    mode="edit"
                    initial={row}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null);
                      router.refresh();
                    }}
                    onResult={show}
                  />
                </li>
              );
            }
            return (
              <li
                key={row.id}
                className={`rounded-lg border p-4 ${
                  row.active
                    ? "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                    : "border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 opacity-75"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {row.title && <span className="font-semibold">{row.title}</span>}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          row.active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {row.active ? "showing" : "hidden"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                      {row.body}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {row.createdByName ?? "Unknown"} ·{" "}
                      {new Date(row.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <label className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                      <input
                        type="checkbox"
                        checked={row.active}
                        disabled={pending}
                        onChange={() => toggleActive(row)}
                      />
                      Show
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(row.id)}
                        disabled={pending}
                        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        disabled={pending}
                        className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AnnouncementForm({
  mode,
  initial,
  onCancel,
  onSaved,
  onResult,
}: {
  mode: "create" | "edit";
  initial?: AnnouncementRow;
  onCancel: () => void;
  onSaved: () => void;
  onResult: (r: AnnouncementActionResult) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const r =
        mode === "create"
          ? await createOrgAnnouncement(formData)
          : await updateOrgAnnouncement(initial!.id, formData);
      onResult(r);
      if (r.ok) onSaved();
    });
  }

  return (
    <form
      action={handleSubmit}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
    >
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Title (optional)
        </label>
        <input
          name="title"
          defaultValue={initial?.title ?? ""}
          maxLength={120}
          placeholder="e.g. Holiday hours next week"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Body
        </label>
        <textarea
          name="body"
          required
          rows={3}
          defaultValue={initial?.body ?? ""}
          maxLength={600}
          placeholder="What do you want everyone in your workspace to know?"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-zinc-500">Max 600 characters.</p>
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={initial?.active ?? true}
        />
        Show this announcement on the dashboard
      </label>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : mode === "create" ? "Post announcement" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
