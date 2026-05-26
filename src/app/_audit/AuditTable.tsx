"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuditAction } from "@/generated/prisma";
import { ENTITY_LABELS } from "@/lib/audit/entities";

/**
 * Filterable, searchable, sortable client table shared between the
 * tenant `/audit` page and the platform `/platform/audit` page. The
 * server fetches a paginated slice (cursor + filters from URL params);
 * this component only renders + drives navigation.
 */

export type AuditRow = {
  id: string;
  createdAt: string;       // ISO
  action: AuditAction;
  actorEmail: string | null;
  actorName: string | null;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  changedFields: string[];
  // Optional — set on the platform view so each row shows which tenant.
  organizationName?: string | null;
  ip?: string | null;
};

const ACTION_LABEL: Record<AuditAction, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  LOGIN: "Login",
  LOGOUT: "Logout",
  ROLE_CHANGE: "Role change",
  IMPERSONATE_START: "Impersonation started",
  IMPERSONATE_END: "Impersonation ended",
  TOKEN_MINT: "API token minted",
  TOKEN_REVOKE: "API token revoked",
  USER_INVITE: "User invited",
  USER_DEACTIVATE: "User deactivated",
  USER_REACTIVATE: "User reactivated",
  AI_CONFIG_CHANGE: "AI config changed",
  EXPORT: "Data exported",
};

const ACTION_BADGE: Record<AuditAction, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  UPDATE: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
  DELETE: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  LOGIN: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  LOGOUT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ROLE_CHANGE: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  IMPERSONATE_START: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  IMPERSONATE_END: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  TOKEN_MINT: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  TOKEN_REVOKE: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  USER_INVITE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  USER_DEACTIVATE: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  USER_REACTIVATE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  AI_CONFIG_CHANGE: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  EXPORT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const ACTION_VALUES = Object.values(AuditAction);

const SORT_COLUMNS = ["createdAt", "action", "entityType"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

export function AuditTable({
  rows,
  total,
  showOrgColumn,
  knownEntityTypes,
  basePath,
}: {
  rows: AuditRow[];
  total: number;
  /** Show the "Tenant" column. True on /platform/audit when scope=all. */
  showOrgColumn: boolean;
  /** Distinct entityType values present in the data — drives the filter dropdown. */
  knownEntityTypes: string[];
  /** The route prefix to push to when filters change. */
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [_, startTransition] = useTransition();

  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );

  function navigate(next: URLSearchParams) {
    startTransition(() => {
      const qs = next.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    });
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    next.delete("cursor"); // reset pagination on filter change
    navigate(next);
  }

  function toggleMulti(key: string, value: string) {
    const current = (params.get(key) ?? "").split(",").filter(Boolean);
    const has = current.includes(value);
    const updated = has ? current.filter((v) => v !== value) : [...current, value];
    setParam(key, updated.length ? updated.join(",") : null);
  }

  const search = params.get("q") ?? "";
  const actionFilter = new Set((params.get("action") ?? "").split(",").filter(Boolean));
  const entityFilter = new Set((params.get("entityType") ?? "").split(",").filter(Boolean));
  const fieldFilter = (params.get("field") ?? "").trim();
  const sort = parseSort(params.get("sort"));
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  const anyFilterActive =
    search.length > 0 ||
    actionFilter.size > 0 ||
    entityFilter.size > 0 ||
    fieldFilter.length > 0;

  function clearAll() {
    const next = new URLSearchParams(params.toString());
    for (const k of ["q", "action", "entityType", "field", "cursor"]) next.delete(k);
    navigate(next);
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
        <input
          type="search"
          defaultValue={search}
          placeholder="Search entity, actor email, or field…"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== search) setParam("q", v || null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = (e.target as HTMLInputElement).value.trim();
              setParam("q", v || null);
            }
          }}
          className="flex-1 min-w-60 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        <ActionMenu
          values={actionFilter}
          onToggle={(v) => toggleMulti("action", v)}
        />
        <EntityMenu
          values={entityFilter}
          onToggle={(v) => toggleMulti("entityType", v)}
          knownEntityTypes={knownEntityTypes}
        />
        <input
          type="text"
          defaultValue={fieldFilter}
          placeholder="Field name (e.g. status)"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== fieldFilter) setParam("field", v || null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = (e.target as HTMLInputElement).value.trim();
              setParam("field", v || null);
            }
          }}
          className="w-44 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        {anyFilterActive && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-zinc-500 tabular-nums">
          {rows.length === total ? total : `${rows.length} / ${total}`} events
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
            <tr>
              <SortHeader column="createdAt" label="When" sort={sort} dir={dir} setParam={setParam} />
              {showOrgColumn && <th className="px-4 py-2 font-medium whitespace-nowrap">Tenant</th>}
              <th className="px-4 py-2 font-medium whitespace-nowrap">Actor</th>
              <SortHeader column="action" label="Action" sort={sort} dir={dir} setParam={setParam} />
              <SortHeader column="entityType" label="Entity" sort={sort} dir={dir} setParam={setParam} />
              <th className="px-4 py-2 font-medium whitespace-nowrap">Changed fields</th>
              <th className="px-4 py-2 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showOrgColumn ? 7 : 6} className="px-4 py-12 text-center text-sm text-zinc-500">
                  {anyFilterActive
                    ? "No events match these filters."
                    : "No audit events yet — they'll appear here as people use the app."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isOpen = openRowId === row.id;
                return (
                  <Row
                    key={row.id}
                    row={row}
                    isOpen={isOpen}
                    onToggle={() => setOpenRowId(isOpen ? null : row.id)}
                    showOrgColumn={showOrgColumn}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseSort(raw: string | null | undefined): SortColumn {
  return (SORT_COLUMNS as readonly string[]).includes(raw ?? "")
    ? (raw as SortColumn)
    : "createdAt";
}

function SortHeader({
  column,
  label,
  sort,
  dir,
  setParam,
}: {
  column: SortColumn;
  label: string;
  sort: SortColumn;
  dir: "asc" | "desc";
  setParam: (key: string, value: string | null) => void;
}) {
  const isActive = sort === column;
  const nextDir: "asc" | "desc" = isActive && dir === "desc" ? "asc" : "desc";
  const arrow = isActive ? (dir === "desc" ? " ↓" : " ↑") : "";
  return (
    <th className="px-4 py-2 font-medium whitespace-nowrap">
      <button
        type="button"
        onClick={() => {
          // Two params at once — set sort, then dir.
          const next = new URLSearchParams(window.location.search);
          if (column === "createdAt") next.delete("sort");
          else next.set("sort", column);
          if (nextDir === "desc") next.delete("dir");
          else next.set("dir", nextDir);
          next.delete("cursor");
          setParam("__bulk__", null); // no-op, just reuse setParam to navigate
          // navigate via window — setParam can't easily set two keys atomically
          window.history.pushState({}, "", `?${next.toString()}`);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }}
        className="hover:text-zinc-900 dark:hover:text-white"
      >
        {label}
        {arrow}
      </button>
    </th>
  );
}

function Row({
  row,
  isOpen,
  onToggle,
  showOrgColumn,
}: {
  row: AuditRow;
  isOpen: boolean;
  onToggle: () => void;
  showOrgColumn: boolean;
}) {
  return (
    <>
      <tr
        className={`border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950 cursor-pointer ${
          isOpen ? "bg-zinc-50 dark:bg-zinc-950" : ""
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400 tabular-nums">
          {new Date(row.createdAt).toLocaleString()}
        </td>
        {showOrgColumn && (
          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            {row.organizationName ?? <span className="text-zinc-400">platform</span>}
          </td>
        )}
        <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
          <div className="font-medium text-zinc-700 dark:text-zinc-300 truncate">
            {row.actorName ?? row.actorEmail ?? <span className="text-zinc-400">system</span>}
          </div>
          {row.actorEmail && row.actorName && (
            <div className="text-[11px] text-zinc-500 truncate">{row.actorEmail}</div>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${ACTION_BADGE[row.action]}`}
          >
            {ACTION_LABEL[row.action]}
          </span>
        </td>
        <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
          {row.entityType ? (
            <div>
              <div className="font-medium truncate">
                {row.entityLabel ?? row.entityId ?? "—"}
              </div>
              <div className="text-[11px] text-zinc-500">
                {ENTITY_LABELS[row.entityType] ?? row.entityType}
              </div>
            </div>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          {row.changedFields.length === 0 ? (
            <span className="text-zinc-400">—</span>
          ) : (
            <div className="flex flex-wrap gap-1 max-w-md">
              {row.changedFields.slice(0, 4).map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-600 dark:text-zinc-400"
                >
                  {f}
                </span>
              ))}
              {row.changedFields.length > 4 && (
                <span className="text-[10px] text-zinc-500">
                  +{row.changedFields.length - 4} more
                </span>
              )}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-right text-xs text-zinc-400">
          {isOpen ? "▲" : "▼"}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800">
          <td colSpan={showOrgColumn ? 7 : 6} className="px-4 py-3">
            <RowDetail row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function RowDetail({ row }: { row: AuditRow }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <Field label="Event id" value={row.id} mono />
      {row.entityId && <Field label="Entity id" value={row.entityId} mono />}
      {row.ip && <Field label="IP" value={row.ip} mono />}
      <Field
        label="All changed fields"
        value={row.changedFields.length ? row.changedFields.join(", ") : "—"}
        mono
      />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 ${mono ? "font-mono" : ""} break-all text-zinc-700 dark:text-zinc-300`}>
        {value}
      </div>
    </div>
  );
}

function ActionMenu({
  values,
  onToggle,
}: {
  values: Set<string>;
  onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      >
        Action {values.size > 0 ? `(${values.size})` : ""}
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 w-56 max-h-72 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-2 text-sm"
          onMouseLeave={() => setOpen(false)}
        >
          {ACTION_VALUES.map((a) => (
            <label
              key={a}
              className="flex items-center gap-2 px-1.5 py-1 cursor-pointer rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <input
                type="checkbox"
                checked={values.has(a)}
                onChange={() => onToggle(a)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <span className="text-xs">{ACTION_LABEL[a]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function EntityMenu({
  values,
  onToggle,
  knownEntityTypes,
}: {
  values: Set<string>;
  onToggle: (v: string) => void;
  knownEntityTypes: string[];
}) {
  const [open, setOpen] = useState(false);
  if (knownEntityTypes.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      >
        Entity {values.size > 0 ? `(${values.size})` : ""}
      </button>
      {open && (
        <div
          className="absolute z-30 mt-1 w-56 max-h-72 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-2 text-sm"
          onMouseLeave={() => setOpen(false)}
        >
          {knownEntityTypes.map((e) => (
            <label
              key={e}
              className="flex items-center gap-2 px-1.5 py-1 cursor-pointer rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <input
                type="checkbox"
                checked={values.has(e)}
                onChange={() => onToggle(e)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <span className="text-xs">{ENTITY_LABELS[e] ?? e}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
