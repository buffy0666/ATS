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
import { FilterBuilder } from "./FilterBuilder";
import { KeywordSearchBar } from "./KeywordSearchBar";
import { SavedSearchesMenu, type SavedSearchEntry } from "./SavedSearchesMenu";
import {
  COLUMN_DEFS,
  COLUMN_FILTERS,
  COLUMN_STORAGE_KEY,
  DEFAULT_COLUMNS,
  SORTABLE_FIELDS,
  parseColumns,
  serializeColumns,
  type ColumnDef,
  type ColumnKey,
} from "./candidate-columns";
import {
  OPERATORS,
  decodeFilter,
  defaultOp,
  encodeFilter,
  joinRange,
  splitRange,
  type FilterType,
} from "./column-filter-ops";
import { loadColumnChoiceOptions } from "./column-filter-actions";
import { ADVANCED_FILTER_KEYS } from "./search-params";
import { SelectionToolbar } from "./SelectionToolbar";
import { selectAllMatchingIds } from "./bulk-actions";

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
  clients: { clientId: string; clientName: string }[];
  lists: { listId: string; listName: string }[];
  sourcedByName: string | null;
};

// Static set of valid column keys — used to scrub unknown keys out of a
// persisted/URL column list (renamed or removed columns).
const KNOWN_COLUMN_KEYS = new Set(COLUMN_DEFS.map((c) => c.key));

export function CandidatesView({
  candidates,
  availableTags,
  savedSearches = [],
  currentUserId = "",
  listId,
  sourceOptions = [],
  seniorityOptions = [],
  listOptions = [],
  jobOptions = [],
  sequenceOptions = [],
  originOverride,
  totalCount,
  page,
  pageSize,
  pageSizeOptions,
  serverDriven = false,
}: {
  candidates: CandidateRow[];
  availableTags: Tag[];
  savedSearches?: SavedSearchEntry[];
  currentUserId?: string;
  listId?: string;
  sourceOptions?: ChoiceOption[];
  seniorityOptions?: ChoiceOption[];
  listOptions?: { id: string; name: string }[];
  jobOptions?: { id: string; title: string }[];
  sequenceOptions?: { id: string; name: string }[];
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
  /**
   * True only on the main /candidates page, where the server honors URL state.
   * Gates sortable headers, URL-driven columns, and the filter builder so they
   * don't become dead controls in embedded contexts (e.g. /lists/[id]).
   */
  serverDriven?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Seed columns from the URL (`cols`) when present so a saved/shared view
  // renders correctly on first paint; otherwise start from defaults and let
  // the mount effect apply the user's localStorage default. Mirrors the
  // lazy-from-URL pattern used for filterValues below.
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(
    () => parseColumns(searchParams?.get("cols"), KNOWN_COLUMN_KEYS) ?? [...DEFAULT_COLUMNS],
  );
  const [hydrated, setHydrated] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Select all matching the filter" (across pages) state.
  const [selectAllActive, setSelectAllActive] = useState(false);
  const [allMatchingIds, setAllMatchingIds] = useState<string[]>([]);
  const [selectAllPending, setSelectAllPending] = useState(false);
  const [selectAllCapped, setSelectAllCapped] = useState(false);
  const [draggingKey, setDraggingKey] = useState<ColumnKey | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<ColumnKey | null>(null);

  // Top horizontal scrollbar synced with the table's scroll container.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const syncingRef = useRef(false);

  useEffect(() => {
    const table = tableScrollRef.current;
    if (!table) return;
    const measure = () => setScrollWidth(table.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(table);
    const inner = table.firstElementChild;
    if (inner) ro.observe(inner);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [candidates, columnOrder]);

  function onTopScroll() {
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }
    const table = tableScrollRef.current;
    const top = topScrollRef.current;
    if (!table || !top) return;
    syncingRef.current = true;
    table.scrollLeft = top.scrollLeft;
  }

  function onTableScroll() {
    if (syncingRef.current) {
      syncingRef.current = false;
      return;
    }
    const table = tableScrollRef.current;
    const top = topScrollRef.current;
    if (!table || !top) return;
    syncingRef.current = true;
    top.scrollLeft = table.scrollLeft;
  }

  // Per-column header filters live in qcol_<key>=<op>:<payload> params.
  // Setting one resets to page 1 since the result set changes.
  function setColumnFilter(key: string, encoded: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (encoded) params.set(`qcol_${key}`, encoded);
    else params.delete(`qcol_${key}`);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }

  // Drop selections for candidates no longer in the visible result set
  // (e.g. when a filter narrows the list). Selections survive column
  // changes since the candidate ID set doesn't change.
  useEffect(() => {
    // A changed result set invalidates "all matching" mode (filters/page moved).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting selection when the server sends a new result set
    setSelectAllActive(false);
    setAllMatchingIds([]);
    setSelectAllCapped(false);
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(candidates.map((c) => c.id));
      const next = new Set<string>();
      for (const id of prev) if (visible.has(id)) next.add(id);
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [candidates]);

  function exitSelectAll() {
    setSelectAllActive(false);
    setAllMatchingIds([]);
    setSelectAllCapped(false);
  }

  function toggleRow(id: string) {
    exitSelectAll();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    exitSelectAll();
    setSelectedIds((prev) => {
      if (prev.size === candidates.length && candidates.length > 0) return new Set();
      return new Set(candidates.map((c) => c.id));
    });
  }

  function clearSelection() {
    exitSelectAll();
    setSelectedIds(new Set());
  }

  function selectAllMatching() {
    setSelectAllPending(true);
    const sp = Object.fromEntries(new URLSearchParams(searchParams?.toString() ?? ""));
    selectAllMatchingIds(sp)
      .then(({ ids, capped }) => {
        setAllMatchingIds(ids);
        setSelectAllActive(true);
        setSelectAllCapped(capped);
      })
      .catch(() => {})
      .finally(() => setSelectAllPending(false));
  }

  const allSelected = candidates.length > 0 && selectedIds.size === candidates.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const effectiveSelectedIds = selectAllActive ? allMatchingIds : [...selectedIds];
  const showSelectAllOffer =
    !selectAllActive &&
    allSelected &&
    totalCount !== undefined &&
    totalCount > candidates.length;

  const knownKeys = useMemo(() => new Set(COLUMN_DEFS.map((c) => c.key)), []);

  const colsParam = searchParams?.get("cols") ?? "";

  // On mount, when the URL carries no column layout, apply the user's
  // localStorage default (client-only, hence an effect). The URL case is
  // already handled by the lazy initializer above.
  useEffect(() => {
    if (!parseColumns(colsParam, knownKeys)) {
      try {
        const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
        if (raw) {
          const arr = JSON.parse(raw);
          const fromStore = Array.isArray(arr)
            ? parseColumns(arr.join(","), knownKeys)
            : null;
          // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage on mount
          if (fromStore) setColumnOrder(fromStore);
        }
      } catch {
        // ignore
      }
    }
    setHydrated(true);
    // Mount-only: later URL changes are handled by the sync effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownKeys]);

  // Keep columns in sync when the `cols` param changes after mount — e.g. the
  // user loads a saved view, which navigates with a new layout.
  useEffect(() => {
    if (!hydrated) return;
    const fromUrl = parseColumns(colsParam, knownKeys);
    if (!fromUrl) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the URL
    setColumnOrder((prev) =>
      prev.length === fromUrl.length && prev.every((k, i) => k === fromUrl[i])
        ? prev
        : fromUrl,
    );
  }, [colsParam, hydrated, knownKeys]);

  // Persist column choices as the personal default.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch {
      // ignore
    }
  }, [columnOrder, hydrated]);

  // Mirror the column layout into the URL (replace, not push — layout isn't a
  // history step) so saving a view captures it and a reload restores it. Only
  // where the server honors URL state.
  const colsWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated || !serverDriven) return;
    const serialized = serializeColumns(columnOrder);
    if (serialized === colsParam) return;
    if (colsWriteRef.current) clearTimeout(colsWriteRef.current);
    colsWriteRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("cols", serialized);
      params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    }, 300);
    return () => {
      if (colsWriteRef.current) clearTimeout(colsWriteRef.current);
    };
  }, [columnOrder, hydrated, serverDriven, colsParam, router, searchParams]);

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
    ADVANCED_FILTER_KEYS.some((k) => (searchParams.get(k) ?? "").length > 0) ||
    // Per-column quick filters live under qcol_* params. Without these the
    // "Clear all filters" escape hatch wouldn't appear when a column filter
    // alone narrows the list to zero — leaving the user stuck.
    Array.from(searchParams.keys()).some(
      (k) => k.startsWith("qcol_") && (searchParams.get(k) ?? "").length > 0,
    );

  function clearAllFilters() {
    router.push("/candidates", { scroll: false });
  }

  // Column sorting (server-honored). Clicking a sortable header cycles
  // asc → desc → off. `dir` defaults to "asc" the first time a column is picked.
  const currentSort = searchParams?.get("sort") ?? "";
  const currentDir = searchParams?.get("dir") ?? "";
  function cycleSort(key: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (currentSort !== key) {
      params.set("sort", key);
      params.set("dir", "asc");
    } else if (currentDir !== "desc") {
      params.set("dir", "desc");
    } else {
      params.delete("sort");
      params.delete("dir");
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }

  function renderSortLabel(colKey: string, label: string) {
    const sortable =
      serverDriven &&
      Boolean(SORTABLE_FIELDS[colKey as keyof typeof SORTABLE_FIELDS]);
    if (!sortable) return <>{label}</>;
    const active = currentSort === colKey;
    const arrow = active ? (currentDir === "desc" ? "▼" : "▲") : "↕";
    return (
      <button
        type="button"
        onClick={() => cycleSort(colKey)}
        className={`inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 ${
          active ? "text-zinc-900 dark:text-zinc-100" : ""
        }`}
        title="Sort by this column"
      >
        {label}
        <span
          className={`text-[9px] ${active ? "" : "text-zinc-300 dark:text-zinc-600"}`}
        >
          {arrow}
        </span>
      </button>
    );
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

      <div className="mb-4 space-y-3">
        <AdvancedFilters
          availableTags={availableTags}
          sourceOptions={sourceOptions}
          seniorityOptions={seniorityOptions}
          listOptions={listOptions}
          jobOptions={jobOptions}
          sequenceOptions={sequenceOptions}
        />
        {serverDriven && (
          <FilterBuilder
            availableTags={availableTags}
            sourceOptions={sourceOptions}
            seniorityOptions={seniorityOptions}
          />
        )}
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

      {/* Select-all-across-pages banner. */}
      {(showSelectAllOffer || selectAllActive) && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {selectAllActive ? (
            <>
              <span>
                All <strong>{allMatchingIds.length.toLocaleString()}</strong> candidates
                matching this filter are selected.
                {selectAllCapped && " (capped at the maximum of 20,000)"}
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="font-medium underline underline-offset-2 hover:text-amber-950 dark:hover:text-white"
              >
                Clear selection
              </button>
            </>
          ) : (
            <>
              <span>
                All <strong>{candidates.length}</strong> on this page are selected.
              </span>
              <button
                type="button"
                onClick={selectAllMatching}
                disabled={selectAllPending}
                className="font-medium underline underline-offset-2 hover:text-amber-950 disabled:opacity-50 dark:hover:text-white"
              >
                {selectAllPending
                  ? "Selecting…"
                  : `Select all ${(totalCount ?? 0).toLocaleString()} matching this filter`}
              </button>
            </>
          )}
        </div>
      )}

      {candidates.length === 0 && !anyFilterActive ? (
        <p className="text-sm text-zinc-500">No candidates yet.</p>
      ) : (
        <>
        {/* Top horizontal scrollbar, mirrors the table's. */}
        <div
          ref={topScrollRef}
          onScroll={onTopScroll}
          className="overflow-x-auto overflow-y-hidden"
          aria-hidden="true"
        >
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>

        {/* Bounded scroll pane so the header can freeze: overflow-auto (both
            axes) makes THIS div the scroll container, so the sticky <thead>
            below pins to its top while rows scroll under it (and scrolls
            horizontally in sync with the body). max-height leaves room for the
            page header / filters / pagination above — tune the offset if your
            chrome is taller. */}
        <div
          ref={tableScrollRef}
          onScroll={onTableScroll}
          className={`rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-auto max-h-[calc(100vh-14rem)] ${selectedIds.size > 0 || selectAllActive ? "pb-20" : ""}`}
        >
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-20 bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2 w-9 sticky left-0 z-30 bg-zinc-50 dark:bg-zinc-950">
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
                <th className="px-4 py-2 font-medium whitespace-nowrap sticky left-9 z-30 bg-zinc-50 dark:bg-zinc-950 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-zinc-200 dark:after:bg-zinc-800">
                  <span className="inline-flex items-center">
                    {renderSortLabel("name", "Name")}
                    {serverDriven && (
                      <ColumnFilterPopover
                        columnKey="name"
                        label="Name"
                        type="text"
                        currentValue={searchParams.get("qcol_name")}
                        onApply={setColumnFilter}
                      />
                    )}
                  </span>
                </th>
                {activeColumns.map((c) => {
                  const isDragging = draggingKey === c.key;
                  const isDropTarget = dropTargetKey === c.key && draggingKey !== c.key;
                  const filterSpec = COLUMN_FILTERS[c.key];
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
                      <span className={`inline-flex items-center ${c.align === "right" ? "flex-row-reverse" : ""}`}>
                        <span
                          aria-hidden="true"
                          className="inline-block mx-1 text-zinc-400 group-hover:text-zinc-600"
                        >
                          ⋮⋮
                        </span>
                        {renderSortLabel(c.key, c.label)}
                        {serverDriven && filterSpec ? (
                          <ColumnFilterPopover
                            columnKey={c.key}
                            label={c.label}
                            type={filterSpec.type}
                            optionsSource={filterSpec.type === "choice" ? filterSpec.options : undefined}
                            currentValue={searchParams.get(`qcol_${c.key}`)}
                            onApply={setColumnFilter}
                          />
                        ) : null}
                      </span>
                    </th>
                  );
                })}
                <th className="px-4 py-2 font-medium text-right w-20"></th>
              </tr>
            </thead>
            <tbody>
              {candidates.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeColumns.length + 3}
                    className="px-4 py-12 text-center text-sm text-zinc-500"
                  >
                    No candidates match these filters. Adjust or clear the column
                    filters above, or use “Clear all filters”.
                  </td>
                </tr>
              ) : (
                candidates.map((c) => (
                <tr
                  key={c.id}
                  className={`group border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950 ${
                    selectedIds.has(c.id) ? "bg-zinc-50 dark:bg-zinc-950" : ""
                  }`}
                >
                  {/* Frozen checkbox + Name columns (opaque bg matching row /
                      selected / hover so scrolled columns pass behind). */}
                  <td
                    className={`px-3 py-3 w-9 sticky left-0 z-10 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-950 ${
                      selectedIds.has(c.id) ? "bg-zinc-50 dark:bg-zinc-950" : "bg-white dark:bg-zinc-900"
                    }`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.firstName} ${c.lastName}`}
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleRow(c.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-zinc-300 dark:border-zinc-700"
                    />
                  </td>
                  <td
                    className={`px-4 py-3 whitespace-nowrap sticky left-9 z-10 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-950 after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-zinc-200 dark:after:bg-zinc-800 ${
                      selectedIds.has(c.id) ? "bg-zinc-50 dark:bg-zinc-950" : "bg-white dark:bg-zinc-900"
                    }`}
                  >
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
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
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
        selectedIds={effectiveSelectedIds}
        onClear={clearSelection}
        onAfterAction={clearSelection}
        listId={listId}
        availableTags={availableTags}
        confirmLarge={selectAllActive}
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
    case "client":
      return c.clients.length === 0 ? (
        "—"
      ) : (
        <div className="flex flex-wrap gap-1 max-w-md">
          {c.clients.map((cl) => (
            <Link
              key={cl.clientId}
              href={`/clients/${cl.clientId}`}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-2 py-0.5 text-xs hover:bg-amber-200 dark:hover:bg-amber-900/60"
            >
              {cl.clientName}
            </Link>
          ))}
        </div>
      );
    case "sourcedBy":
      return c.sourcedByName ?? "—";
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

const FIELD_INPUT_CLASS =
  "w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-normal text-zinc-700 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200";

/**
 * Per-header filter control. Renders a funnel toggle in the column header; the
 * popover (fixed-positioned so the table's overflow pane doesn't clip it)
 * offers a type-appropriate operator + value editor. Choice options are loaded
 * lazily on first open via a server action.
 */
function ColumnFilterPopover({
  columnKey,
  label,
  type,
  optionsSource,
  currentValue,
  onApply,
}: {
  columnKey: string;
  label: string;
  type: FilterType;
  optionsSource?: string;
  currentValue: string | null;
  onApply: (key: string, encoded: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const [op, setOp] = useState(defaultOp(type));
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [optionQuery, setOptionQuery] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [options, setOptions] = useState<{ value: string; label: string }[] | null>(null);

  const active = decodeFilter(type, currentValue) != null;

  function openPopover() {
    const d = decodeFilter(type, currentValue);
    setOp(d?.op ?? defaultOp(type));
    if (type === "text") setText(d && !["empty", "nempty"].includes(d.op) ? d.value : "");
    if (type === "choice") {
      setSelected(d ? d.value.split(",").filter(Boolean) : []);
      setOptionQuery("");
    }
    if (type === "number" || type === "date") {
      const [a, b] = splitRange(d?.op === "range" ? d.value : "");
      if (type === "number") {
        setMin(a);
        setMax(b);
      } else {
        setFrom(a);
        setTo(b);
      }
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setPos({
        top: Math.min(r.bottom + 4, window.innerHeight - 320),
        left: Math.max(8, Math.min(r.left, window.innerWidth - 272)),
      });
    }
    if (type === "choice" && optionsSource && options == null) {
      loadColumnChoiceOptions(optionsSource)
        .then(setOptions)
        .catch(() => setOptions([]));
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function apply() {
    let encoded: string | null = null;
    if (type === "text") encoded = encodeFilter("text", op, text);
    else if (type === "choice") encoded = encodeFilter("choice", op, selected.join(","));
    else if (type === "number")
      encoded = op === "range" ? encodeFilter("number", "range", joinRange(min, max)) : encodeFilter("number", op, "");
    else if (type === "date")
      encoded = op === "range" ? encodeFilter("date", "range", joinRange(from, to)) : encodeFilter("date", op, "");
    else if (type === "presence") encoded = encodeFilter("presence", op, "");
    onApply(columnKey, encoded);
    setOpen(false);
  }

  function clear() {
    onApply(columnKey, null);
    setOpen(false);
  }

  function toggleSelected(v: string) {
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  const needsValue = OPERATORS[type].find((o) => o.value === op)?.needsValue ?? false;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openPopover();
        }}
        title={`Filter by ${label.toLowerCase()}`}
        aria-label={`Filter by ${label}`}
        className={`ml-1 rounded px-1 text-[11px] leading-none ${
          active ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        }`}
      >
        ⏷
      </button>
      {open && pos && (
        <div
          ref={popRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 256 }}
          onMouseDown={(e) => e.stopPropagation()}
          className="z-50 rounded-md border border-zinc-200 bg-white p-2 text-xs font-normal normal-case tracking-normal text-zinc-700 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <div className="mb-1.5 font-medium text-zinc-900 dark:text-zinc-100">{label}</div>
          <select value={op} onChange={(e) => setOp(e.target.value)} className={`${FIELD_INPUT_CLASS} mb-2`}>
            {OPERATORS[type].map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {type === "text" && needsValue && (
            <input
              autoFocus
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
              placeholder="Value…"
              className={FIELD_INPUT_CLASS}
            />
          )}

          {type === "choice" && needsValue && (
            options == null ? (
              <p className="px-1 py-1 text-zinc-400">Loading…</p>
            ) : options.length === 0 ? (
              <p className="px-1 py-1 text-zinc-400">No options.</p>
            ) : (
              <>
                {options.length > 8 && (
                  <input
                    type="text"
                    value={optionQuery}
                    onChange={(e) => setOptionQuery(e.target.value)}
                    placeholder="Search options…"
                    className={`${FIELD_INPUT_CLASS} mb-1.5`}
                  />
                )}
                <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1">
                  {options
                    .filter(
                      (o) =>
                        !optionQuery.trim() ||
                        o.label.toLowerCase().includes(optionQuery.trim().toLowerCase()),
                    )
                    .map((o) => (
                      <label
                        key={o.value}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(o.value)}
                          onChange={() => toggleSelected(o.value)}
                          className="rounded border-zinc-300 dark:border-zinc-700"
                        />
                        <span className="truncate">{o.label}</span>
                      </label>
                    ))}
                </div>
              </>
            )
          )}

          {type === "number" && op === "range" && (
            <div className="flex items-center gap-1.5">
              <input type="number" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Min" className={FIELD_INPUT_CLASS} />
              <span className="text-zinc-400">–</span>
              <input type="number" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max" className={FIELD_INPUT_CLASS} />
            </div>
          )}

          {type === "date" && op === "range" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD_INPUT_CLASS} />
              <span className="text-zinc-400">–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={FIELD_INPUT_CLASS} />
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={clear}
              className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </>
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
