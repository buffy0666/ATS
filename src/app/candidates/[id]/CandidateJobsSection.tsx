"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Stage } from "@/generated/prisma";
import {
  addCandidateToJob,
  removeCandidateFromJob,
  updateApplicationStage,
} from "./jobs-actions";

/**
 * Inline job-pipeline controls on the candidate detail page.
 *
 * For each existing application: shows the job title, a stage selector,
 * and a remove button. Below the list, an "add to another job" combobox
 * lets the recruiter put the candidate on any open job they aren't
 * already on.
 */

type Application = {
  id: string;
  jobId: string;
  jobTitle: string;
  stage: Stage;
};

type JobOption = { id: string; title: string };

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: Stage.APPLIED, label: "Applied" },
  { value: Stage.SCREEN, label: "Screen" },
  { value: Stage.INTERVIEW, label: "Interview" },
  { value: Stage.OFFER, label: "Offer" },
  { value: Stage.HIRED, label: "Hired" },
  { value: Stage.REJECTED, label: "Rejected" },
];

const STAGE_BADGE: Record<Stage, string> = {
  APPLIED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  SCREEN: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  INTERVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  OFFER: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  HIRED: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function CandidateJobsSection({
  candidateId,
  applications,
  availableJobs,
}: {
  candidateId: string;
  applications: Application[];
  /** Open jobs this candidate is NOT already on. */
  availableJobs: JobOption[];
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Jobs ({applications.length})
        </h2>
        <Link
          href={`/interviews/new?candidateId=${candidateId}`}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Schedule interview
        </Link>
      </div>

      {applications.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-3">Not on any job yet.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {applications.map((a) => (
            <ApplicationRow key={a.id} candidateId={candidateId} app={a} />
          ))}
        </ul>
      )}

      <AddToJobPicker candidateId={candidateId} availableJobs={availableJobs} />
    </section>
  );
}

function ApplicationRow({
  candidateId,
  app,
}: {
  candidateId: string;
  app: Application;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onStageChange(newStage: Stage) {
    if (newStage === app.stage) return;
    setError(null);
    startTransition(async () => {
      const result = await updateApplicationStage(app.id, candidateId, newStage);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onRemove() {
    if (
      !confirm(
        `Remove this candidate from "${app.jobTitle}"? Their application and any per-job notes will be deleted.`,
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await removeCandidateFromJob(app.id, candidateId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/jobs/${app.jobId}`}
          className="font-medium text-sm hover:underline min-w-0 truncate"
          title={app.jobTitle}
        >
          {app.jobTitle}
        </Link>

        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STAGE_BADGE[app.stage]}`}
        >
          {STAGE_OPTIONS.find((s) => s.value === app.stage)?.label ?? app.stage}
        </span>

        <select
          value={app.stage}
          disabled={pending}
          onChange={(e) => onStageChange(e.target.value as Stage)}
          aria-label={`Change stage for ${app.jobTitle}`}
          className="ml-auto rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-xs disabled:opacity-50"
        >
          {STAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          className="rounded-md border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
          aria-label={`Remove from ${app.jobTitle}`}
          title="Remove from this job"
        >
          Remove
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </li>
  );
}

/**
 * Typeahead picker for adding the candidate to another open job. Reuses the
 * combobox UX from the job-detail page's AddCandidateForm, scoped down.
 */
function AddToJobPicker({
  candidateId,
  availableJobs,
}: {
  candidateId: string;
  availableJobs: JobOption[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableJobs.slice(0, 20);
    const tokens = q.split(/\s+/);
    return availableJobs
      .filter((j) => {
        const hay = j.title.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 20);
  }, [query, availableJobs]);

  if (availableJobs.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        No other open jobs to add this candidate to.{" "}
        <Link href="/jobs/new" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">
          Create one
        </Link>
        .
      </p>
    );
  }

  function pick(job: JobOption) {
    setError(null);
    setOpen(false);
    setQuery("");
    startTransition(async () => {
      const result = await addCandidateToJob(candidateId, job.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[highlight]) {
        e.preventDefault();
        pick(results[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        disabled={pending}
        placeholder="Add to another job…"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        aria-autocomplete="list"
        aria-expanded={open}
        role="combobox"
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 disabled:opacity-50"
      />
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg"
        >
          {results.map((j, i) => (
            <li
              key={j.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(j);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === highlight
                  ? "bg-zinc-100 dark:bg-zinc-800"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              }`}
            >
              {j.title}
            </li>
          ))}
        </ul>
      )}
      {open && results.length === 0 && query.trim() && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg px-3 py-2 text-sm text-zinc-500">
          No matching jobs.
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {pending && <p className="mt-1.5 text-xs text-zinc-500">Adding…</p>}
    </div>
  );
}
