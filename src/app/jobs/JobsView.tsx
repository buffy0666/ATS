"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { JobStatus } from "@/generated/prisma";
import { JOB_TYPES } from "./constants";

export type JobRow = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  status: JobStatus;
  jobType: string | null;
  createdAt: string; // ISO
  client: { id: string; name: string } | null;
  hiringManagers: string[];
  salaryRange: string | null;
  inProcess: number;
  finalInterview: number;
};

type ColumnKey =
  | "title"
  | "client"
  | "department"
  | "location"
  | "jobType"
  | "hiringManagers"
  | "salaryRange"
  | "status"
  | "createdAt"
  | "inProcess"
  | "finalInterview";

type ColumnDef = {
  key: ColumnKey;
  label: string;
  align?: "right";
  title?: string;
  /** Title is the row anchor and can't be turned off. */
  required?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "title", label: "Title", required: true },
  { key: "client", label: "Client" },
  { key: "department", label: "Department" },
  { key: "location", label: "Location" },
  { key: "jobType", label: "Job type" },
  { key: "hiringManagers", label: "Hiring managers" },
  { key: "salaryRange", label: "Salary range" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Created" },
  { key: "inProcess", label: "In process", align: "right", title: "Candidates not yet hired or rejected" },
  { key: "finalInterview", label: "Final interview", align: "right", title: "Candidates at the Interview stage" },
];

// Columns shown by default (the original set + nothing extra).
const DEFAULT_VISIBLE: ColumnKey[] = [
  "title",
  "client",
  "location",
  "salaryRange",
  "status",
  "createdAt",
  "inProcess",
  "finalInterview",
];

const STORAGE_KEY = "jobs.visibleColumns.v1";

function jobTypeBadge(type: string): string {
  switch (type) {
    case "Urgent":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "Luxury":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

export function JobsView({ jobs }: { jobs: JobRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | JobStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [visible, setVisible] = useState<Set<ColumnKey>>(new Set(DEFAULT_VISIBLE));
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  // Restore saved column choices.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const keys = JSON.parse(raw) as ColumnKey[];
        if (Array.isArray(keys) && keys.length > 0) {
          setVisible(new Set<ColumnKey>(["title", ...keys]));
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // Close the column menu on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggleColumn(key: ColumnKey) {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      next.add("title"); // always keep the anchor
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const shownColumns = COLUMNS.filter((c) => visible.has(c.key));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== "ALL" && j.status !== statusFilter) return false;
      if (typeFilter !== "all" && (j.jobType ?? "") !== typeFilter) return false;
      if (q) {
        const hay = [
          j.title,
          j.client?.name ?? "",
          j.department ?? "",
          j.location ?? "",
          j.jobType ?? "",
          j.salaryRange ?? "",
          j.status,
          ...j.hiringManagers,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, query, statusFilter, typeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, client, location, hiring manager…"
          className="flex-1 min-w-60 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          <option value={JobStatus.OPEN}>Open</option>
          <option value={JobStatus.DRAFT}>Draft</option>
          <option value={JobStatus.CLOSED}>Closed</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="all">All job types</option>
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <div className="relative" ref={colMenuRef}>
          <button
            type="button"
            onClick={() => setColMenuOpen((v) => !v)}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            Columns ▾
          </button>
          {colMenuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 shadow-lg">
              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                    c.required ? "opacity-50" : "hover:bg-zinc-50 dark:hover:bg-zinc-950 cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={visible.has(c.key)}
                    disabled={c.required}
                    onChange={() => toggleColumn(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {(query || statusFilter !== "ALL" || typeFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("ALL");
              setTypeFilter("all");
            }}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="text-xs text-zinc-500">
        {filtered.length} job{filtered.length === 1 ? "" : "s"}
        {filtered.length !== jobs.length ? ` (of ${jobs.length})` : ""}
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
            <tr>
              {shownColumns.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  className={`px-4 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={shownColumns.length} className="px-4 py-8 text-center text-sm text-zinc-500">
                  No jobs match those filters.
                </td>
              </tr>
            ) : (
              filtered.map((j) => (
                <tr
                  key={j.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                >
                  {shownColumns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-3 ${
                        c.align === "right"
                          ? "text-right tabular-nums"
                          : "text-zinc-600 dark:text-zinc-400"
                      } ${c.key === "salaryRange" || c.key === "createdAt" ? "whitespace-nowrap" : ""}`}
                    >
                      <Cell job={j} col={c.key} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ job, col }: { job: JobRow; col: ColumnKey }) {
  switch (col) {
    case "title":
      return (
        <Link href={`/jobs/${job.id}`} className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline">
          {job.title}
        </Link>
      );
    case "client":
      return job.client ? (
        <Link href={`/clients/${job.client.id}`} className="hover:underline">
          {job.client.name}
        </Link>
      ) : (
        <>—</>
      );
    case "department":
      return <>{job.department ?? "—"}</>;
    case "location":
      return <>{job.location ?? "—"}</>;
    case "jobType":
      return job.jobType ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${jobTypeBadge(job.jobType)}`}>
          {job.jobType}
        </span>
      ) : (
        <>—</>
      );
    case "hiringManagers":
      return <>{job.hiringManagers.length > 0 ? job.hiringManagers.join(", ") : "—"}</>;
    case "salaryRange":
      return <>{job.salaryRange ?? "—"}</>;
    case "status":
      return (
        <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
          {job.status}
        </span>
      );
    case "createdAt":
      return <>{new Date(job.createdAt).toLocaleDateString()}</>;
    case "inProcess":
      return <>{job.inProcess}</>;
    case "finalInterview":
      return <>{job.finalInterview}</>;
    default:
      return <>—</>;
  }
}
