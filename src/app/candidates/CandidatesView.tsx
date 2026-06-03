"use client";

import Link from "next/link";
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandidateStatus,
  EmploymentType,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";
import { tagClass } from "@/lib/tag-colors";
import { CandidateCursorTracker } from "@/components/CandidateCursorTracker";
import { AdvancedFilters } from "./AdvancedFilters";
import { DeleteCandidateButton } from "./DeleteCandidateButton";
import { KeywordSearchBar } from "./KeywordSearchBar";
import { SavedSearchesMenu, type SavedSearchEntry } from "./SavedSearchesMenu";
import {
  COLUMN_DEFS,
  COLUMN_STORAGE_KEY,
  DEFAULT_COLUMNS,
  QUICK_FILTER_FIELDS,
  type ColumnDef,
  type ColumnKey,
} from "./candidate-columns";
import { ADVANCED_FILTER_KEYS } from "./search-params";
import { SelectionToolbar } from "./SelectionToolbar";

type Tag = { id: string; name: string; color: string };
type ChoiceOption = { id: string; name: string };

export type CandidateRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  alternateEmail: string | null;
  alternatePhone: string | null;
  status: CandidateStatus;
  rating: number | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  timezone: string | null;
  willingToRelocate: boolean;
  currentTitle: string | null;
  currentCompany: string | null;
  yearsExperience: number | null;
  seniority: string | null;
  workAuthorization: WorkAuth | null;
  requiresSponsorship: boolean;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  currentSalary: number | null;
  salaryCurrency: string;
  availableFrom: Date | null;
  noticePeriodDays: number | null;
  employmentTypePref: EmploymentType[];
  remotePref: RemotePref[];
  industries: string[];
  specialties: string[];
  source: string | null;
  sourceDetail: string | null;
  lastContactedAt: Date | null;
  nextFollowUpAt: Date | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  resumeUrl: string | null;
  summary: string | null;
  createdAt: Date;
  tags: Tag[];
  applicationCount: number;
  jobs: { applicationId: string; jobId: string; jobTitle: string; stage: string }[];
  lists: { listId: string; listName: string }[];
};

export function CandidatesView({
  candidates,
  availableTags,
  savedSearches = [],
  currentUserId = "",
  listId,
  sourceOptions = [],
  seniorityOptions = [],
  originOverride,
  totalCount,
  page,
  pageSize,
  pageSizeOptions,
}: {
  candidates: CandidateRow[];
  availableTags: Tag[];
  savedSearches?: SavedSearchEntry[];
  currentUserId?: string;
  listId?: string;
  sourceOptions?: ChoiceOption[];
  seniorityOptions?: ChoiceOption[];
  /**
   * Override the "back to" target for the candidate-detail Prev/Next cursor.
   * Pass this from views that embed CandidatesView in a non-default context
   * — e.g., /lists/[id] wants the cursor's "Back" link to point to the list,
   * not the global /candidates page.
   */
  originOverride?: { href: string; label: string };
  /** Total candidates matching the current filters across all pages. */
  totalCount?: number;
  /** 1-based current page. */
  page?: number;
  /** Rows per page (one of pageSizeOptions). */
  pageSize?: number;
  /** Choices for the per-page selector. */
  pageSizeOptions?: number[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>([...DEFAULT_COLUMNS]);
  const [hydrated, setHydrated] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draggingKey, setDraggingKey] = useState<ColumnKey | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<ColumnKey | null>(null);

  // Quick per-column filters (the input row under the header). Seeded
  // from URL params so a reload/back-button trip preserves the filters,
  // then locally edited with a debounced push back to the URL.
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const k of Object.keys(QUICK_FILTER_FIELDS)) {
      const v = searchParams?.get(`qcol_${k}`) ?? "";
      if (v) seed[k] = v;
    }
    return seed;
  });
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function updateQuickFilter(key: string, value: string) {
    setFilterValues((prev) => {
      const next = { ...prev, [key]: value };
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
      filterDebounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        for (const k of Object.keys(QUICK_FILTER_FIELDS)) {
          const val = (next[k] ?? "").trim();
          if (val) params.set(`qcol_${k}`, val);
          else params.delete(`qcol_${k}`);
        }
        // A new filter set might leave the user on a page that no longer
        // exists — drop the cursor back to page 1.
        params.delete("page");
        const qs = params.toString();
        router.push(qs ? `?${qs}` : "?");
      }, 350);
      return next;
    });
  }

  // Drop selections for candidates no longer in the visible result set
  // (e.g. when a filter narrows the list). Selections survive column
  // changes since the candidate ID set doesn't change.
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(candidates.map((c) => c.id));
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [candidates]);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) => {
      if (prev.size === candidates.length && candidates.length > 0) return new Set();
      return new Set(candidates.map((c) => c.id));
    });
  }

  const allSelected = candidates.length > 0 && selectedIds.size === candidates.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const knownKeys = useMemo(() => new Set(COLUMN_DEFS.map((c) => c.key)), []);

  // Load column choices from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.every((k) => typeof k === "string")) {
          // Filter out any column keys that no longer exist (renamed/removed),
          // and de-dupe while preserving order.
          const seen = new Set<string>();
          const cleaned: ColumnKey[] = [];
          for (const k of arr as ColumnKey[]) {
            if (knownKeys.has(k) && !seen.has(k)) {
              seen.add(k);
              cleaned.push(k);
            }
          }
          setColumnOrder(cleaned);
        }
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, [knownKeys]);

  // Persist column choices.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch {
      // ignore
    }
  }, [columnOrder, hydrated]);

  function toggleColumn(key: ColumnKey) {
    setColumnOrder((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function resetColumns() {
    setColumnOrder([...DEFAULT_COLUMNS]);
  }

  function showAllColumns() {
    setColumnOrder(COLUMN_DEFS.map((c) => c.key));
  }

  function moveColumn(sourceKey: ColumnKey, targetKey: ColumnKey) {
    if (sourceKey === targetKey) return;
    setColumnOrder((prev) => {
      const next = prev.filter((k) => k !== sourceKey);
      const insertAt = next.indexOf(targetKey);
      if (insertAt < 0) return prev;
      next.splice(insertAt, 0, sourceKey);
      return next;
    });
  }

  const visibleSet = useMemo(() => new Set(columnOrder), [columnOrder]);

  const activeColumns = useMemo(() => {
    const byKey = new Map(COLUMN_DEFS.map((c) => [c.key, c] as const));
    return columnOrder
      .map((k) => byKey.get(k))
      .filter((c): c is ColumnDef => Boolean(c));
  }, [columnOrder]);

  const groupedColumns = useMemo(() => {
    const groups = new Map<string, ColumnDef[]>();
    for (const c of COLUMN_DEFS) {
      if (!groups.has(c.category)) groups.set(c.category, []);
      groups.get(c.category)!.push(c);
    }
    return [...groups.entries()];
  }, []);

  const anyFilterActive =
    (searchParams.get("q") ?? "").length > 0 ||
    ADVANCED_FILTER_KEYS.some((k) => (searchParams.get(k) ?? "").length > 0);

  function clearAllFilters() {
    router.push("/candidates", { scroll: false });
  }

  // Build the navigation cursor reflecting whatever the user currently sees.
  // Includes any active filter (?status=… etc.) in the "back to" link so the
  // user lands back on the same filtered view, not a wide-open table.
  const cursorIds = useMemo(() => candidates.map((c) => c.id), [candidates]);
  const searchString = searchParams?.toString() ?? "";
  const defaultHref = searchString ? `/candidates?${searchString}` : "/candidates";
  const defaultLabel = anyFilterActive
    ? `Candidates (${cursorIds.length} filtered)`
    : "All candidates";
  const cursorHref = originOverride?.href ?? defaultHref;
  const cursorLabel = originOverride?.label ?? defaultLabel;

  return (
    <main className="flex-1 max-w-[120rem] mx-auto w-full px-6 py-10">
      <CandidateCursorTracker ids={cursorIds} originHref={cursorHref} originLabel={cursorLabel} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Candidates</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/candidates/import"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Import CSV
          </Link>
          <Link
            href="/candidates/new"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            New candidate
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <KeywordSearchBar />
        <SavedSearchesMenu entries={savedSearches} currentUserId={currentUserId} />

        {anyFilterActive && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
          >
            Clear all filters
          </button>
        )}

        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setShowPicker((s) => !s)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Columns ({activeColumns.length})
          </button>
          {showPicker && (
            <div className="absolute right-0 mt-1 w-80 max-h-96 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-3 z-20 text-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">Visible columns</span>
                <div className="flex gap-2 text-xs">
                  <button onClick={resetColumns} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline">
                    Defaults
                  </button>
                  <button onClick={showAllColumns} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline">
                    All
                  </button>
                </div>
              </div>
              <p className="mb-2 text-[11px] text-zinc-500">
                Tip: drag column headers in the table to reorder them.
              </p>
              <div className="space-y-3">
                {groupedColumns.map(([category, cols]) => (
                  <div key={category}>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">
                      {category}
                    </div>
                    <div className="space-y-1">
                      {cols.map((col) => (
                        <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={visibleSet.has(col.key)}
                            onChange={() => toggleColumn(col.key)}
                            className="rounded border-zinc-300 dark:border-zinc-700"
                          />
                          <span>{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4">
        <AdvancedFilters
          availableTags={availableTags}
          sourceOptions={sourceOptions}
          seniorityOptions={seniorityOptions}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Paginator
          searchParams={searchParams}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          pageSizeOptions={pageSizeOptions}
          visibleRows={candidates.length}
          location="top"
        />
        {selectedIds.size === 2 ? (
          <button
            type="button"
            onClick={() => {
              const [a, b] = [...selectedIds];
              router.push(`/candidates/merge?a=${a}&b=${b}`);
            }}
            className="shrink-0 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
          >
            Merge selected →
          </button>
        ) : (
          <span
            className="shrink-0 text-xs text-zinc-400"
            title="Select exactly two candidates to merge them into one record."
          >
            Merge: select exactly two
          </span>
        )}
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {anyFilterActive ? "No candidates match these filters." : "No candidates yet."}
        </p>
      ) : (
        // Bounded scroll pane so the header can freeze: overflow-auto (both
        // axes) makes THIS div the scroll container, so the sticky <thead>
        // below pins to its top while rows scroll under it (and scrolls
        // horizontally in sync with the body). max-height leaves room for the
        // page header / filters / pagination above — tune the offset if your
        // chrome is taller.
        <div className={`rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-auto max-h-[calc(100vh-14rem)] ${selectedIds.size > 0 ? "pb-20" : ""}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 w-9">
                  <input
                    type="checkbox"
                    aria-label="Select all candidates on this page"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    className="rounded border-zinc-300 dark:border-zinc-700"
                  />
                </th>
                <th className="px-4 py-2 font-medium whitespace-nowrap">Name</th>
                {activeColumns.map((c) => {
                  const isDragging = draggingKey === c.key;
                  const isDropTarget = dropTargetKey === c.key && draggingKey !== c.key;
                  return (
                    <th
                      key={c.key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", c.key);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingKey(c.key);
                      }}
                      onDragEnter={() => {
                        if (draggingKey && draggingKey !== c.key) setDropTargetKey(c.key);
                      }}
                      onDragOver={(e) => {
                        if (draggingKey && draggingKey !== c.key) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }
                      }}
                      onDragLeave={() => {
                        if (dropTargetKey === c.key) setDropTargetKey(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sourceKey = e.dataTransfer.getData("text/plain") as ColumnKey;
                        if (sourceKey) moveColumn(sourceKey, c.key);
                        setDraggingKey(null);
                        setDropTargetKey(null);
                      }}
                      onDragEnd={() => {
                        setDraggingKey(null);
                        setDropTargetKey(null);
                      }}
                      title="Drag to reorder"
                      className={`px-4 py-2 font-medium whitespace-nowrap select-none cursor-grab active:cursor-grabbing ${
                        c.align === "right" ? "text-right" : ""
                      } ${isDragging ? "opacity-40" : ""} ${
                        isDropTarget ? "border-l-2 border-zinc-900 dark:border-zinc-100" : ""
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block mr-1 text-zinc-400 group-hover:text-zinc-600"
                      >
                        ⋮⋮
                      </span>
                      {c.label}
                    </th>
                  );
                })}
                <th className="px-4 py-2 font-medium text-right w-20"></th>
              </tr>
              {/* Per-column quick-filter row. Text-typed columns get a
                  small "Filter…" box; others render an empty cell. */}
              <tr className="border-t border-zinc-100 bg-zinc-50/60 dark:border-zinc-900 dark:bg-zinc-950/40">
                <th className="px-3 py-1.5"></th>
                <th className="px-2 py-1.5">
                  <QuickFilterInput
                    value={filterValues.name ?? ""}
                    onChange={(v) => updateQuickFilter("name", v)}
                  />
                </th>
                {activeColumns.map((c) => {
                  const filterable = QUICK_FILTER_FIELDS[c.key as keyof typeof QUICK_FILTER_FIELDS];
                  return (
                    <th key={c.key} className="px-2 py-1.5">
                      {filterable ? (
                        <QuickFilterInput
                          value={filterValues[c.key] ?? ""}
                          onChange={(v) => updateQuickFilter(c.key, v)}
                        />
                      ) : null}
                    </th>
                  );
                })}
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  className={`border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950 ${
                    selectedIds.has(c.id) ? "bg-zinc-50 dark:bg-zinc-950" : ""
                  }`}
                >
                  <td className="px-3 py-3 w-9">
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.firstName} ${c.lastName}`}
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleRow(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-zinc-300 dark:border-zinc-700"
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">
                      {c.firstName} {c.lastName}
                    </Link>
                  </td>
                  {activeColumns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-zinc-600 dark:text-zinc-400 ${col.align === "right" ? "text-right tabular-nums" : ""}`}
                    >
                      {renderCell(c, col.key)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <DeleteCandidateButton
                      candidateId={c.id}
                      candidateName={`${c.firstName} ${c.lastName}`}
                      applicationCount={c.applicationCount}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginator
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        pageSizeOptions={pageSizeOptions}
        visibleRows={candidates.length}
        location="bottom"
      />

      <SelectionToolbar
        selectedIds={[...selectedIds]}
        onClear={() => setSelectedIds(new Set())}
        onAfterAction={() => setSelectedIds(new Set())}
        listId={listId}
        availableTags={availableTags}
      />
    </main>
  );
}

function fmtDate(d: Date | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function fmtMoney(n: number | null, currency: string) {
  return n == null ? "—" : `${currency} ${n.toLocaleString()}`;
}

function renderCell(c: CandidateRow, key: ColumnKey): React.ReactNode {
  switch (key) {
    case "email":
      return c.email;
    case "phone":
      return c.phone ?? "—";
    case "altEmail":
      return c.alternateEmail ?? "—";
    case "altPhone":
      return c.alternatePhone ?? "—";
    case "status":
      return (
        <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
          {c.status.replace(/_/g, " ")}
        </span>
      );
    case "rating":
      return c.rating ?? "—";
    case "tags":
      return c.tags.length === 0 ? (
        "—"
      ) : (
        <div className="flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <span
              key={t.id}
              className={`rounded-full px-1.5 py-0 text-[10px] ${tagClass(t.color)}`}
            >
              {t.name}
            </span>
          ))}
        </div>
      );
    case "applications":
      return c.applicationCount;
    case "lists":
      return c.lists.length === 0 ? (
        "—"
      ) : (
        <div className="flex flex-wrap gap-1 max-w-md">
          {c.lists.map((l) => (
            <Link
              key={l.listId}
              href={`/lists/${l.listId}`}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 px-2 py-0.5 text-xs hover:bg-indigo-200 dark:hover:bg-indigo-900/60"
            >
              {l.listName}
            </Link>
          ))}
        </div>
      );
    case "jobs":
      return c.jobs.length === 0 ? (
        "—"
      ) : (
        <div className="flex flex-wrap gap-1 max-w-md">
          {c.jobs.map((j) => (
            <Link
              key={j.applicationId}
              href={`/jobs/${j.jobId}`}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700"
              title={`Stage: ${j.stage.replace(/_/g, " ")}`}
            >
              {j.jobTitle}
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">
                {j.stage.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
        </div>
      );
    case "city":
      return c.locationCity ?? "—";
    case "state":
      return c.locationState ?? "—";
    case "country":
      return c.locationCountry ?? "—";
    case "timezone":
      return c.timezone ?? "—";
    case "willingToRelocate":
      return c.willingToRelocate ? "Yes" : "No";
    case "currentTitle":
      return c.currentTitle ?? "—";
    case "currentCompany":
      return c.currentCompany ?? "—";
    case "yearsExperience":
      return c.yearsExperience ?? "—";
    case "seniority":
      return c.seniority ? c.seniority.replace(/_/g, " ") : "—";
    case "workAuth":
      return c.workAuthorization ? c.workAuthorization.replace(/_/g, " ") : "—";
    case "needsSponsorship":
      return c.requiresSponsorship ? "Yes" : "No";
    case "desiredSalary": {
      const min = c.desiredSalaryMin;
      const max = c.desiredSalaryMax;
      if (min == null && max == null) return "—";
      const lo = fmtMoney(min, c.salaryCurrency);
      const hi = fmtMoney(max, c.salaryCurrency);
      return `${lo} – ${hi}`;
    }
    case "currentSalary":
      return fmtMoney(c.currentSalary, c.salaryCurrency);
    case "availableFrom":
      return fmtDate(c.availableFrom);
    case "noticeDays":
      return c.noticePeriodDays ?? "—";
    case "remotePref":
      return c.remotePref.length ? c.remotePref.map((r) => r.replace(/_/g, " ")).join(", ") : "—";
    case "employmentTypePref":
      return c.employmentTypePref.length
        ? c.employmentTypePref.map((r) => r.replace(/_/g, " ")).join(", ")
        : "—";
    case "industries":
      return c.industries.length ? c.industries.join(", ") : "—";
    case "specialties":
      return c.specialties.length ? c.specialties.join(", ") : "—";
    case "source":
      return c.source ? c.source.replace(/_/g, " ") : "—";
    case "lastContactedAt":
      return fmtDate(c.lastContactedAt);
    case "nextFollowUpAt":
      return fmtDate(c.nextFollowUpAt);
    case "linkedin":
      return c.linkedinUrl ? (
        <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">
          View
        </a>
      ) : (
        "—"
      );
    case "github":
      return c.githubUrl ? (
        <a href={c.githubUrl} target="_blank" rel="noopener noreferrer" className="underline">
          View
        </a>
      ) : (
        "—"
      );
    case "portfolio":
      return c.portfolioUrl ? (
        <a href={c.portfolioUrl} target="_blank" rel="noopener noreferrer" className="underline">
          View
        </a>
      ) : (
        "—"
      );
    case "resume":
      return c.resumeUrl ? (
        <a href={c.resumeUrl} target="_blank" rel="noopener noreferrer" className="underline">
          View
        </a>
      ) : (
        "—"
      );
    case "summary":
      return c.summary ? (
        <span className="line-clamp-2 max-w-xs inline-block align-top">{c.summary}</span>
      ) : (
        "—"
      );
    case "createdAt":
      return fmtDate(c.createdAt);
  }
}

/** Compact text input used in the quick-filter row above the table data. */
function QuickFilterInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Filter…"
      className="w-full rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs font-normal text-zinc-700 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
      aria-label="Quick filter"
    />
  );
}

/**
 * "Showing X–Y of Z" header with a per-page selector and page-number nav.
 * Every nav action is a URL change (Next.js Link) so other search params
 * (filters, q, etc.) stay intact and the resulting page is bookmarkable.
 */
function Paginator({
  searchParams,
  page = 1,
  pageSize,
  totalCount,
  pageSizeOptions,
  visibleRows,
  location,
}: {
  searchParams: ReadonlyURLSearchParams | null;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  pageSizeOptions?: number[];
  visibleRows: number;
  location: "top" | "bottom";
}) {
  // If the parent didn't wire pagination yet (e.g. legacy callers), keep
  // the old terse "X candidate(s)" hint and skip the nav controls.
  if (pageSize === undefined || totalCount === undefined) {
    return (
      <div className={`text-xs text-zinc-500 ${location === "top" ? "mb-2" : "mt-3"}`}>
        {visibleRows} candidate{visibleRows === 1 ? "" : "s"}
      </div>
    );
  }

  const first = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(totalCount, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const linkFor = (params: Record<string, string | number | null>) => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, String(v));
    }
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  };

  const linkClass = (disabled: boolean) =>
    `rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800 ${
      disabled ? "pointer-events-none opacity-40" : ""
    }`;

  // Build a compact list of page numbers: first, last, ±2 around current.
  const pageNumbers: (number | "…")[] = [];
  const pushed = new Set<number>();
  function push(n: number) {
    if (n >= 1 && n <= totalPages && !pushed.has(n)) {
      pushed.add(n);
      pageNumbers.push(n);
    }
  }
  push(1);
  if (page - 2 > 2) pageNumbers.push("…");
  for (let i = page - 2; i <= page + 2; i++) push(i);
  if (page + 2 < totalPages - 1) pageNumbers.push("…");
  push(totalPages);

  return (
    <div
      className={`flex flex-wrap items-center gap-3 text-xs ${
        location === "top" ? "mb-2" : "mt-3"
      }`}
    >
      <span className="text-zinc-500">
        {totalCount === 0 ? (
          "0 candidates"
        ) : (
          <>
            Showing <strong className="text-zinc-700 dark:text-zinc-200">{first.toLocaleString()}</strong>–
            <strong className="text-zinc-700 dark:text-zinc-200">{last.toLocaleString()}</strong> of{" "}
            <strong className="text-zinc-700 dark:text-zinc-200">{totalCount.toLocaleString()}</strong>
          </>
        )}
      </span>

      {pageSizeOptions && pageSizeOptions.length > 1 && (
        <label className="inline-flex items-center gap-1.5 text-zinc-500">
          <span>per page</span>
          {/* a plain select that navigates on change keeps URL state authoritative */}
          <PageSizeSelect
            currentValue={pageSize}
            options={pageSizeOptions}
            searchParams={searchParams}
          />
        </label>
      )}

      {totalPages > 1 && (
        <nav className="ml-auto flex items-center gap-1">
          <Link href={linkFor({ page: page > 1 ? page - 1 : null })} className={linkClass(page <= 1)} aria-label="Previous page">
            ←
          </Link>
          {pageNumbers.map((n, idx) =>
            n === "…" ? (
              <span key={`gap-${idx}`} className="px-1 text-zinc-400">…</span>
            ) : (
              <Link
                key={n}
                href={linkFor({ page: n === 1 ? null : n })}
                className={`rounded-md border px-2 py-1 ${
                  n === page
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                {n}
              </Link>
            ),
          )}
          <Link href={linkFor({ page: page < totalPages ? page + 1 : null })} className={linkClass(page >= totalPages)} aria-label="Next page">
            →
          </Link>
        </nav>
      )}
    </div>
  );
}

function PageSizeSelect({
  currentValue,
  options,
  searchParams,
}: {
  currentValue: number;
  options: number[];
  searchParams: ReadonlyURLSearchParams | null;
}) {
  const router = useRouter();
  return (
    <select
      value={currentValue}
      onChange={(e) => {
        const next = new URLSearchParams(searchParams?.toString() ?? "");
        const v = Number(e.target.value);
        if (v === options[0]) next.delete("pageSize");
        else next.set("pageSize", String(v));
        // Reset to page 1 whenever the page size changes — otherwise the
        // user could land on a page that no longer exists.
        next.delete("page");
        const qs = next.toString();
        router.push(qs ? `?${qs}` : "?");
      }}
      className="rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
