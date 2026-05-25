"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { TaskPriority, TaskStatus } from "@/generated/prisma";
import {
  bulkDeleteTasks,
  bulkUpdateTasks,
  type BulkPatchInput,
} from "./actions";

const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  NOT_STARTED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  IN_PROGRESS: "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  COMPLETE: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  LOW: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  MEDIUM: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  HIGH: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  URGENT: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export const SORT_COLUMNS = ["name", "status", "priority", "dueDate", "updatedAt", "createdAt"] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

export type TaskRow = {
  id: string;
  name: string;
  status: TaskStatus;
  priority: TaskPriority | null;
  dueDate: Date | null;
  attachmentCount: number;
  updatedAt: Date;
  createdAt: Date;
  createdBy: { name: string | null; email: string } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
};

type UserOption = { id: string; name: string | null; email: string };

export function TasksTable({
  tasks,
  assignableUsers,
  status,
  sort,
  dir,
}: {
  tasks: TaskRow[];
  assignableUsers: UserOption[];
  status: TaskStatus | null;
  sort: SortColumn;
  dir: "asc" | "desc";
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);

  // Drop selections for tasks no longer in the visible list (e.g. filter narrowed it).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(tasks.map((t) => t.id));
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [tasks]);

  const allSelected = tasks.length > 0 && selectedIds.size === tasks.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id)),
    );
  }

  function showBanner(text: string) {
    setBanner(text);
    setTimeout(() => setBanner(null), 4000);
  }

  function applyPatch(patch: BulkPatchInput, successMsg: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        const r = await bulkUpdateTasks(ids, patch);
        showBanner(`${successMsg} (${r.count})`);
        router.refresh();
      } catch (err) {
        showBanner(err instanceof Error ? err.message : "Bulk update failed.");
      }
    });
  }

  function applyDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} task${ids.length === 1 ? "" : "s"}? Attachments will be removed too.`)) {
      return;
    }
    startTransition(async () => {
      try {
        const r = await bulkDeleteTasks(ids);
        showBanner(`Deleted ${r.count} task${r.count === 1 ? "" : "s"}.`);
        setSelectedIds(new Set());
        router.refresh();
      } catch (err) {
        showBanner(err instanceof Error ? err.message : "Bulk delete failed.");
      }
    });
  }

  return (
    <>
      <StatusFilter current={status} sort={sort} dir={dir} />

      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500 mt-6">
          No tasks{status ? ` with status "${STATUS_LABEL[status]}"` : ""}.
        </p>
      ) : (
        <div
          className={`mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto ${
            selectedIds.size > 0 ? "pb-20" : ""
          }`}
        >
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 w-9">
                  <input
                    type="checkbox"
                    aria-label="Select all tasks"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="rounded border-zinc-300 dark:border-zinc-700"
                  />
                </th>
                <SortHeader column="name" label="Name" sort={sort} dir={dir} status={status} />
                <SortHeader column="status" label="Status" sort={sort} dir={dir} status={status} />
                <SortHeader column="priority" label="Priority" sort={sort} dir={dir} status={status} />
                <th className="px-4 py-2 font-medium">Assignee</th>
                <SortHeader column="dueDate" label="Due" sort={sort} dir={dir} status={status} />
                <th className="px-4 py-2 font-medium">Files</th>
                <SortHeader column="updatedAt" label="Updated" sort={sort} dir={dir} status={status} />
                <SortHeader column="createdAt" label="Created" sort={sort} dir={dir} status={status} />
                <th className="px-4 py-2 font-medium">Created by</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const isSel = selectedIds.has(t.id);
                return (
                  <tr
                    key={t.id}
                    className={`border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950 ${
                      isSel ? "bg-zinc-50 dark:bg-zinc-950" : ""
                    }`}
                  >
                    <td className="px-3 py-3 w-9">
                      <input
                        type="checkbox"
                        aria-label={`Select ${t.name}`}
                        checked={isSel}
                        onChange={() => toggleRow(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-zinc-300 dark:border-zinc-700"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[t.status]}`}
                      >
                        {STATUS_LABEL[t.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.priority ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${PRIORITY_BADGE[t.priority]}`}
                        >
                          {PRIORITY_LABEL[t.priority]}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {t.assignedTo
                        ? t.assignedTo.name ?? t.assignedTo.email
                        : <span className="text-zinc-400">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {t.dueDate ? t.dueDate.toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                      {t.attachmentCount}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {t.updatedAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                      {t.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {t.createdBy?.name ?? t.createdBy?.email ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <BulkBar
        count={selectedIds.size}
        pending={pending}
        banner={banner}
        assignableUsers={assignableUsers}
        onClear={() => setSelectedIds(new Set())}
        onPatch={applyPatch}
        onDelete={applyDelete}
      />
    </>
  );
}

function BulkBar({
  count,
  pending,
  banner,
  assignableUsers,
  onClear,
  onPatch,
  onDelete,
}: {
  count: number;
  pending: boolean;
  banner: string | null;
  assignableUsers: UserOption[];
  onClear: () => void;
  onPatch: (patch: BulkPatchInput, successMsg: string) => void;
  onDelete: () => void;
}) {
  if (count === 0 && !banner) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[min(90rem,calc(100vw-2rem))] w-full sm:w-auto">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg px-4 py-2.5 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium pr-2 border-r border-zinc-200 dark:border-zinc-700 mr-1">
          {count} selected
        </span>

        <StatusMenu disabled={pending || count === 0} onPick={(s) => onPatch({ status: s }, `Status updated`)} />
        <PriorityMenu
          disabled={pending || count === 0}
          onPick={(p) => onPatch({ priority: p }, "Priority updated")}
        />
        <AssigneeMenu
          disabled={pending || count === 0}
          users={assignableUsers}
          onPick={(uid) => onPatch({ assignedToId: uid }, "Assignee updated")}
        />
        <DueDateInput
          disabled={pending || count === 0}
          onPick={(d) => onPatch({ dueDate: d }, "Due date updated")}
        />

        <button
          type="button"
          onClick={onDelete}
          disabled={pending || count === 0}
          className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
        >
          Delete
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={pending || count === 0}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
        >
          Clear
        </button>

        {banner && (
          <span className="ml-auto text-xs text-zinc-500" aria-live="polite">
            {banner}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusMenu({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (s: TaskStatus) => void;
}) {
  return (
    <select
      defaultValue=""
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) {
          onPick(e.target.value as TaskStatus);
          e.target.value = "";
        }
      }}
      className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs disabled:opacity-50"
    >
      <option value="">Set status…</option>
      {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

function PriorityMenu({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (p: TaskPriority | "__clear__") => void;
}) {
  return (
    <select
      defaultValue=""
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) {
          onPick(e.target.value as TaskPriority | "__clear__");
          e.target.value = "";
        }
      }}
      className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs disabled:opacity-50"
    >
      <option value="">Set priority…</option>
      {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABEL[p]}
        </option>
      ))}
      <option value="__clear__">Clear priority</option>
    </select>
  );
}

function AssigneeMenu({
  disabled,
  users,
  onPick,
}: {
  disabled: boolean;
  users: UserOption[];
  onPick: (id: string | "__clear__") => void;
}) {
  return (
    <select
      defaultValue=""
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value) {
          onPick(e.target.value);
          e.target.value = "";
        }
      }}
      className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs disabled:opacity-50 max-w-[12rem]"
    >
      <option value="">Set assignee…</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name ?? u.email}
        </option>
      ))}
      <option value="__clear__">Unassign</option>
    </select>
  );
}

function DueDateInput({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (iso: string | "__clear__") => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        disabled={disabled}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs disabled:opacity-50"
      >
        Set due date…
      </button>
      {open && (
        <div
          className="absolute bottom-full mb-1 left-0 z-30 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-2 flex items-center gap-2"
          onMouseLeave={() => setOpen(false)}
        >
          <input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={() => {
              if (value) {
                onPick(value);
                setOpen(false);
                setValue("");
              }
            }}
            disabled={!value}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2 py-1 text-xs disabled:opacity-50"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              onPick("__clear__");
              setOpen(false);
            }}
            className="text-xs text-zinc-500 hover:text-red-600 underline"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function buildHref(params: { status: TaskStatus | null; sort: SortColumn; dir: "asc" | "desc" }) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.sort !== "updatedAt") q.set("sort", params.sort);
  if (params.dir !== "desc") q.set("dir", params.dir);
  const qs = q.toString();
  return qs ? `/tasks?${qs}` : "/tasks";
}

function StatusFilter({
  current,
  sort,
  dir,
}: {
  current: TaskStatus | null;
  sort: SortColumn;
  dir: "asc" | "desc";
}) {
  const options: { label: string; value: TaskStatus | null }[] = [
    { label: "All", value: null },
    { label: "Not started", value: TaskStatus.NOT_STARTED },
    { label: "In progress", value: TaskStatus.IN_PROGRESS },
    { label: "Complete", value: TaskStatus.COMPLETE },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-zinc-500">Filter</span>
      {options.map((opt) => {
        const isActive = current === opt.value;
        return (
          <Link
            key={opt.label}
            href={buildHref({ status: opt.value, sort, dir })}
            className={`rounded-full border px-3 py-1 text-xs ${
              isActive
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

function SortHeader({
  column,
  label,
  sort,
  dir,
  status,
}: {
  column: SortColumn;
  label: string;
  sort: SortColumn;
  dir: "asc" | "desc";
  status: TaskStatus | null;
}) {
  const isActive = sort === column;
  const nextDir: "asc" | "desc" = isActive && dir === "desc" ? "asc" : "desc";
  const arrow = isActive ? (dir === "desc" ? " ↓" : " ↑") : "";
  return (
    <th className="px-4 py-2 font-medium">
      <Link
        href={buildHref({ status, sort: column, dir: nextDir })}
        className="hover:text-zinc-900 dark:hover:text-white whitespace-nowrap"
      >
        {label}
        {arrow}
      </Link>
    </th>
  );
}
