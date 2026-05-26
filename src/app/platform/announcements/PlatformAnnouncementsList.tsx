"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnnouncementAudience } from "@/generated/prisma";
import {
  createPlatformAnnouncement,
  deletePlatformAnnouncement,
  setPlatformAnnouncementActive,
  updatePlatformAnnouncement,
  type PlatformAnnouncementResult,
} from "./actions";

export type OrgOption = { id: string; name: string; slug: string };

export type PlatformAnnouncementRow = {
  id: string;
  title: string | null;
  body: string;
  active: boolean;
  audience: AnnouncementAudience;
  createdAt: string;
  createdByName: string | null;
  targets: OrgOption[];
};

export function PlatformAnnouncementsList({
  rows,
  organizations,
}: {
  rows: PlatformAnnouncementRow[];
  organizations: OrgOption[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function show(r: PlatformAnnouncementResult) {
    setBanner({ tone: r.ok ? "ok" : "err", text: r.message });
    setTimeout(() => setBanner(null), 4000);
  }

  function toggleActive(row: PlatformAnnouncementRow) {
    startTransition(async () => {
      const r = await setPlatformAnnouncementActive(row.id, !row.active);
      show(r);
      if (r.ok) router.refresh();
    });
  }

  function remove(row: PlatformAnnouncementRow) {
    if (
      !confirm(
        `Delete this announcement? It'll disappear from every tenant immediately.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await deletePlatformAnnouncement(row.id);
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
        <PlatformAnnouncementForm
          mode="create"
          organizations={organizations}
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
        <p className="text-sm text-zinc-500">No platform announcements yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            if (editingId === row.id) {
              return (
                <li key={row.id}>
                  <PlatformAnnouncementForm
                    mode="edit"
                    initial={row}
                    organizations={organizations}
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
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          row.audience === AnnouncementAudience.ALL_TENANTS
                            ? "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
                            : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:bg-sky-900/40 dark:text-sky-200"
                        }`}
                      >
                        {row.audience === AnnouncementAudience.ALL_TENANTS
                          ? "All tenants"
                          : `${row.targets.length} tenant${row.targets.length === 1 ? "" : "s"}`}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          row.active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {row.active ? "showing" : "hidden"}
                      </span>
                      {row.title && <span className="font-semibold">{row.title}</span>}
                    </div>
                    <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                      {row.body}
                    </p>
                    {row.audience === AnnouncementAudience.SELECTED_TENANTS && row.targets.length > 0 && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Visible to: {row.targets.map((t) => t.name).join(", ")}
                      </p>
                    )}
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

function PlatformAnnouncementForm({
  mode,
  initial,
  organizations,
  onCancel,
  onSaved,
  onResult,
}: {
  mode: "create" | "edit";
  initial?: PlatformAnnouncementRow;
  organizations: OrgOption[];
  onCancel: () => void;
  onSaved: () => void;
  onResult: (r: PlatformAnnouncementResult) => void;
}) {
  const [audience, setAudience] = useState<AnnouncementAudience>(
    initial?.audience ?? AnnouncementAudience.ALL_TENANTS,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initial?.targets.map((t) => t.id) ?? []),
  );
  const [pending, startTransition] = useTransition();

  function toggleOrg(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(formData: FormData) {
    // Replace whatever was in the FormData under "organizationIds" with our
    // checked state so the server gets the picker's truth.
    formData.delete("organizationIds");
    for (const id of selectedIds) formData.append("organizationIds", id);
    formData.set("audience", audience);

    startTransition(async () => {
      const r =
        mode === "create"
          ? await createPlatformAnnouncement(formData)
          : await updatePlatformAnnouncement(initial!.id, formData);
      onResult(r);
      if (r.ok) onSaved();
    });
  }

  return (
    <form
      action={handleSubmit}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Title (optional)
        </label>
        <input
          name="title"
          defaultValue={initial?.title ?? ""}
          maxLength={120}
          placeholder="e.g. Scheduled maintenance Saturday 02:00 UTC"
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
          placeholder="What do you want your tenants to see?"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-zinc-500">Max 600 characters.</p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Who sees this?
        </legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="audience"
            checked={audience === AnnouncementAudience.ALL_TENANTS}
            onChange={() => setAudience(AnnouncementAudience.ALL_TENANTS)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Everyone</span>{" "}
            <span className="text-zinc-500">— shows on every tenant&apos;s dashboard.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="audience"
            checked={audience === AnnouncementAudience.SELECTED_TENANTS}
            onChange={() => setAudience(AnnouncementAudience.SELECTED_TENANTS)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Specific tenants</span>{" "}
            <span className="text-zinc-500">— pick which workspaces below.</span>
          </span>
        </label>
      </fieldset>

      {audience === AnnouncementAudience.SELECTED_TENANTS && (
        <div className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 max-h-56 overflow-y-auto">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500">
              {selectedIds.size} of {organizations.length} selected
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
                onClick={() => setSelectedIds(new Set(organizations.map((o) => o.id)))}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
            </div>
          </div>
          {organizations.length === 0 ? (
            <p className="text-sm text-zinc-500">No tenants exist yet.</p>
          ) : (
            <ul className="space-y-1">
              {organizations.map((o) => (
                <li key={o.id}>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(o.id)}
                      onChange={() => toggleOrg(o.id)}
                    />
                    <span className="truncate">
                      {o.name}{" "}
                      <span className="text-zinc-500 text-xs">({o.slug})</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={initial?.active ?? true}
        />
        Show on the dashboard right away
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
