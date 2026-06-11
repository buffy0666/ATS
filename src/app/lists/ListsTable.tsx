"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type ListRow = {
  id: string;
  name: string;
  description: string | null;
  scope: "PERSONAL" | "SHARED";
  ownerLabel: string;
  jobs: { id: string; title: string }[];
  assignees: string[];
  memberCount: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

type SortKey =
  | "name"
  | "description"
  | "scope"
  | "ownerLabel"
  | "createdAt"
  | "members"
  | "updatedAt";
type SortDir = "asc" | "desc";
type ScopeFilter = "ALL" | "PERSONAL" | "SHARED";

const inputClass =
  "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm";

export function ListsTable({ lists }: { lists: ListRow[] }) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Parse date-input strings as local midnight so the range matches the
    // dates the user sees (avoids UTC off-by-one).
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;

    const rows = lists.filter((l) => {
      if (needle) {
        const hay = `${l.name} ${l.description ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (scope !== "ALL" && l.scope !== scope) return false;
      const created = new Date(l.createdAt).getTime();
      if (fromTs !== null && created < fromTs) return false;
      if (toTs !== null && created > toTs) return false;
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      let cmp: number;
      switch (sortKey) {
        case "members":
          cmp = a.memberCount - b.memberCount;
          break;
        case "createdAt":
        case "updatedAt":
          cmp = new Date(a[sortKey]).getTime() - new Date(b[sortKey]).getTime();
          break;
        case "description":
          cmp = (a.description ?? "").localeCompare(b.description ?? "");
          break;
        default:
          cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      }
      // Stable tiebreak by name so equal keys keep a deterministic order.
      return (cmp || a.name.localeCompare(b.name)) * dir;
    });
  }, [lists, q, scope, from, to, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Dates default to newest-first; everything else to A→Z.
      setSortDir(key === "createdAt" || key === "updatedAt" || key === "members" ? "desc" : "asc");
    }
  }

  if (lists.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No lists yet. Create one to bucket candidates for outreach, screening rounds, etc.
      </p>
    );
  }

  const hasFilters = q.trim() !== "" || scope !== "ALL" || from !== "" || to !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500" htmlFor="lists-search">
            Search name or description
          </label>
          <input
            id="lists-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className={`${inputClass} w-64`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500" htmlFor="lists-scope">
            Scope
          </label>
          <select
            id="lists-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as ScopeFilter)}
            className={inputClass}
          >
            <option value="ALL">All</option>
            <option value="PERSONAL">Personal</option>
            <option value="SHARED">Shared</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500" htmlFor="lists-from">
            Created from
          </label>
          <input
            id="lists-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500" htmlFor="lists-to">
            Created to
          </label>
          <input
            id="lists-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setScope("ALL");
              setFrom("");
              setTo("");
            }}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
            <tr>
              <SortHeader label="Name" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Description" col="description" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Scope" col="scope" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-4 py-2 font-medium">Jobs</th>
              <th className="px-4 py-2 font-medium">Assigned to</th>
              <SortHeader label="Created by" col="ownerLabel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Created" col="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHeader label="Members" col="members" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <SortHeader label="Updated" col="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No lists match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                >
                  <td className="px-4 py-3">
                    <Link href={`/lists/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {l.description ? (
                      <span className="line-clamp-2 max-w-md">{l.description}</span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                        l.scope === "SHARED"
                          ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {l.scope.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {l.jobs.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {l.jobs.map((j) => (
                          <Link
                            key={j.id}
                            href={`/jobs/${j.id}`}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:underline dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {j.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {l.assignees.length === 0 ? (
                      <span className="text-zinc-400">—</span>
                    ) : (
                      l.assignees.join(", ")
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{l.ownerLabel}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {new Date(l.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.memberCount}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {new Date(l.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 uppercase hover:text-zinc-800 dark:hover:text-zinc-200 ${
          active ? "text-zinc-800 dark:text-zinc-200" : ""
        }`}
      >
        {label}
        <span className="text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}
