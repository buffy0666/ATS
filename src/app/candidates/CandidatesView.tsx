"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CandidateSource,
  CandidateStatus,
  EmploymentType,
  RemotePref,
  Seniority,
  WorkAuth,
} from "@/generated/prisma";
import { tagClass } from "@/lib/tag-colors";
import { AdvancedFilters } from "./AdvancedFilters";
import { DeleteCandidateButton } from "./DeleteCandidateButton";
import { KeywordSearchBar } from "./KeywordSearchBar";
import { SavedSearchesMenu, type SavedSearchEntry } from "./SavedSearchesMenu";
import {
  COLUMN_DEFS,
  COLUMN_STORAGE_KEY,
  DEFAULT_COLUMNS,
  type ColumnDef,
  type ColumnKey,
} from "./candidate-columns";
import { ADVANCED_FILTER_KEYS } from "./search-params";
import { SelectionToolbar } from "./SelectionToolbar";

type Tag = { id: string; name: string; color: string };

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
  seniority: Seniority | null;
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
  source: CandidateSource | null;
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
};

export function CandidatesView({
  candidates,
  availableTags,
  savedSearches = [],
  currentUserId = "",
  listId,
}: {
  candidates: CandidateRow[];
  availableTags: Tag[];
  savedSearches?: SavedSearchEntry[];
  currentUserId?: string;
  listId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [columns, setColumns] = useState<Set<ColumnKey>>(new Set(DEFAULT_COLUMNS));
  const [hydrated, setHydrated] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Load column choices from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.every((k) => typeof k === "string")) {
          setColumns(new Set(arr as ColumnKey[]));
        }
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // Persist column choices.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...columns]));
    } catch {
      // ignore
    }
  }, [columns, hydrated]);

  function toggleColumn(key: ColumnKey) {
    setColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetColumns() {
    setColumns(new Set(DEFAULT_COLUMNS));
  }

  function showAllColumns() {
    setColumns(new Set(COLUMN_DEFS.map((c) => c.key)));
  }

  const activeColumns = useMemo(
    () => COLUMN_DEFS.filter((c) => columns.has(c.key)),
    [columns],
  );

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

  return (
    <main className="flex-1 max-w-[120rem] mx-auto w-full px-6 py-10">
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
                            checked={columns.has(col.key)}
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
        <AdvancedFilters availableTags={availableTags} />
      </div>

      <div className="text-xs text-zinc-500 mb-2">
        {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {anyFilterActive ? "No candidates match these filters." : "No candidates yet."}
        </p>
      ) : (
        <div className={`rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto ${selectedIds.size > 0 ? "pb-20" : ""}`}>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
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
                {activeColumns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-2 font-medium whitespace-nowrap ${c.align === "right" ? "text-right" : ""}`}
                  >
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2 font-medium text-right w-20"></th>
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
