"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CandidateStatus, Stage } from "@/generated/prisma";
import { tagClass } from "@/lib/tag-colors";
import {
  addQuickNote,
  markContactedNow,
  setApplicationStage,
  setCandidateRating,
  setCandidateStatus,
  setNextFollowUp,
  type QuickNoteResult,
} from "./review-actions";

const STAGES: Stage[] = [
  Stage.APPLIED,
  Stage.SCREEN,
  Stage.INTERVIEW,
  Stage.OFFER,
  Stage.HIRED,
  Stage.REJECTED,
];

const STAGE_LABEL: Record<Stage, string> = {
  APPLIED: "Applied",
  SCREEN: "Screen",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

const STATUS_LABEL: Record<CandidateStatus, string> = {
  ACTIVE: "Active",
  PASSIVE: "Passive",
  PLACED: "Placed",
  ON_HOLD: "On hold",
  DO_NOT_CONTACT: "Do not contact",
  ALUMNI: "Alumni",
  BLACKLISTED: "Blacklisted",
};

const STATUS_BADGE: Record<CandidateStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  PASSIVE: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  PLACED: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  ON_HOLD: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  DO_NOT_CONTACT: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  ALUMNI: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  BLACKLISTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

type Tag = { id: string; name: string; color: string };

type ApplicationRow = {
  id: string;
  stage: Stage;
  job: { id: string; title: string };
};

type Note = {
  id: string;
  body: string;
  createdAt: Date;
  author: { name: string | null; email: string };
  application: { id: string; job: { title: string }; stage: Stage };
};

export type Candidate = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  pronouns: string | null;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  resumeUrl: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  workAuthorization: string | null;
  requiresSponsorship: boolean;
  currentTitle: string | null;
  currentCompany: string | null;
  yearsExperience: number | null;
  seniority: string | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  salaryCurrency: string;
  remotePref: string[];
  status: CandidateStatus;
  rating: number | null;
  nextFollowUpAt: Date | null;
  lastContactedAt: Date | null;
  summary: string | null;
  tags: Tag[];
  applications: ApplicationRow[];
  recentNotes: Note[];
};

export function ReviewClient({
  candidate,
  position,
  total,
  prevId,
  nextId,
  fromParam,
}: {
  candidate: Candidate;
  position: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
  fromParam: string;
}) {
  const router = useRouter();
  const fromQs = fromParam ? `?from=${encodeURIComponent(fromParam)}` : "";

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "ArrowRight") {
        if (nextId) router.push(`/candidates/${nextId}/review${fromQs}`);
      } else if (e.key === "k" || e.key === "ArrowLeft") {
        if (prevId) router.push(`/candidates/${prevId}/review${fromQs}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextId, prevId, fromQs, router]);

  return (
    <main className="flex-1 flex flex-col h-[calc(100vh-0px)] overflow-hidden">
      {/* Top bar */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-3 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={backHref(fromParam)}
            className="text-sm text-zinc-500 hover:underline whitespace-nowrap"
          >
            ← Back
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold truncate">
                {candidate.firstName} {candidate.lastName}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_BADGE[candidate.status]}`}
              >
                {STATUS_LABEL[candidate.status]}
              </span>
            </div>
            <div className="text-xs text-zinc-500 truncate">
              {[candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(" · ") || candidate.email}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-500 tabular-nums">
            {position} / {total}
          </span>
          <Link
            href={prevId ? `/candidates/${prevId}/review${fromQs}` : "#"}
            aria-disabled={!prevId}
            className={`rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-sm ${
              prevId ? "hover:bg-zinc-50 dark:hover:bg-zinc-800" : "opacity-40 pointer-events-none"
            }`}
            title="Previous (k or ←)"
          >
            ←
          </Link>
          <Link
            href={nextId ? `/candidates/${nextId}/review${fromQs}` : "#"}
            aria-disabled={!nextId}
            className={`rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-sm ${
              nextId ? "hover:bg-zinc-50 dark:hover:bg-zinc-800" : "opacity-40 pointer-events-none"
            }`}
            title="Next (j or →)"
          >
            Next →
          </Link>
          <Link
            href={`/candidates/${candidate.id}`}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Full detail
          </Link>
        </div>
      </header>

      {/* Body split */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_28rem] min-h-0">
        {/* Resume pane */}
        <section className="bg-zinc-100 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <ResumeViewer resumeUrl={candidate.resumeUrl} />
        </section>

        {/* Review panel */}
        <aside className="overflow-y-auto bg-white dark:bg-zinc-900 px-5 py-4 space-y-5">
          <RatingRow candidateId={candidate.id} rating={candidate.rating} />

          <StatusRow candidateId={candidate.id} status={candidate.status} />

          <Metadata candidate={candidate} />

          {candidate.tags.length > 0 && (
            <section>
              <SectionLabel>Tags</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {candidate.tags.map((t) => (
                  <span key={t.id} className={`rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)}`}>
                    {t.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {candidate.summary && (
            <section>
              <SectionLabel>Summary</SectionLabel>
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                {candidate.summary}
              </p>
            </section>
          )}

          <ApplicationsControls applications={candidate.applications} />

          <FollowUpRow
            candidateId={candidate.id}
            nextFollowUpAt={candidate.nextFollowUpAt}
            lastContactedAt={candidate.lastContactedAt}
          />

          <QuickNote candidateId={candidate.id} applications={candidate.applications} />

          {candidate.recentNotes.length > 0 && (
            <section>
              <SectionLabel>Recent notes</SectionLabel>
              <ul className="space-y-2">
                {candidate.recentNotes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs"
                  >
                    <div className="text-zinc-500 mb-1">
                      {n.author.name ?? n.author.email} ·{" "}
                      <span className="font-mono text-zinc-400">{n.application.job.title}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{n.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">
            Keyboard: <kbd className="rounded border border-zinc-300 dark:border-zinc-700 px-1">j</kbd>
            /
            <kbd className="rounded border border-zinc-300 dark:border-zinc-700 px-1">k</kbd> next/prev
          </div>
        </aside>
      </div>
    </main>
  );
}

function backHref(fromParam: string): string {
  if (fromParam.startsWith("job:")) return `/jobs/${fromParam.slice(4)}`;
  return "/candidates";
}

function ResumeViewer({ resumeUrl }: { resumeUrl: string | null }) {
  if (!resumeUrl) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center text-sm text-zinc-500">
        No resume uploaded for this candidate.
      </div>
    );
  }
  const isPdf = /\.pdf($|\?)/i.test(resumeUrl);
  if (isPdf) {
    return (
      <iframe
        src={resumeUrl}
        title="Resume"
        className="w-full h-full border-0 bg-white"
      />
    );
  }
  return (
    <div className="h-full flex items-center justify-center p-8 text-center text-sm">
      <div>
        <p className="text-zinc-600 dark:text-zinc-400 mb-3">
          Inline preview only supports PDFs. This resume is a different format.
        </p>
        <a
          href={resumeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
        >
          Open resume
        </a>
      </div>
    </div>
  );
}

function RatingRow({ candidateId, rating }: { candidateId: string; rating: number | null }) {
  const [pending, startTransition] = useTransition();
  const current = rating ?? 0;
  function setStar(n: number) {
    const next = current === n ? null : n; // click same star to clear
    startTransition(() => setCandidateRating(candidateId, next));
  }
  return (
    <section>
      <SectionLabel>Rating</SectionLabel>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={pending}
            onClick={() => setStar(n)}
            className={`text-xl leading-none transition-colors ${
              n <= current
                ? "text-amber-500"
                : "text-zinc-300 dark:text-zinc-700 hover:text-amber-300"
            } disabled:opacity-50`}
            aria-label={`Set rating to ${n}`}
          >
            ★
          </button>
        ))}
        {current > 0 && (
          <button
            type="button"
            onClick={() => startTransition(() => setCandidateRating(candidateId, null))}
            className="ml-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
          >
            Clear
          </button>
        )}
      </div>
    </section>
  );
}

function StatusRow({
  candidateId,
  status,
}: {
  candidateId: string;
  status: CandidateStatus;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <section>
      <SectionLabel>Status</SectionLabel>
      <select
        value={status}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => setCandidateStatus(candidateId, e.target.value as CandidateStatus))
        }
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      >
        {Object.values(CandidateStatus).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </section>
  );
}

function Metadata({ candidate }: { candidate: Candidate }) {
  const lines: { label: string; value: React.ReactNode }[] = [
    { label: "Email", value: candidate.email },
    { label: "Phone", value: candidate.phone ?? "—" },
    {
      label: "Location",
      value:
        [candidate.locationCity, candidate.locationState, candidate.locationCountry]
          .filter(Boolean)
          .join(", ") || "—",
    },
    {
      label: "Currently",
      value:
        [candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(" at ") || "—",
    },
    {
      label: "Experience",
      value:
        candidate.yearsExperience != null
          ? `${candidate.yearsExperience}y${candidate.seniority ? ` · ${candidate.seniority}` : ""}`
          : candidate.seniority ?? "—",
    },
    {
      label: "Desired comp",
      value:
        candidate.desiredSalaryMin || candidate.desiredSalaryMax
          ? `${candidate.salaryCurrency} ${(candidate.desiredSalaryMin ?? 0).toLocaleString()} – ${(candidate.desiredSalaryMax ?? 0).toLocaleString()}`
          : "—",
    },
    {
      label: "Work auth",
      value: candidate.workAuthorization ?? (candidate.requiresSponsorship ? "Needs sponsorship" : "—"),
    },
    {
      label: "Remote",
      value: candidate.remotePref.length ? candidate.remotePref.join(", ") : "—",
    },
    {
      label: "Links",
      value:
        [
          candidate.linkedinUrl && (
            <a key="li" href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">
              LinkedIn
            </a>
          ),
          candidate.githubUrl && (
            <a key="gh" href={candidate.githubUrl} target="_blank" rel="noopener noreferrer" className="underline">
              GitHub
            </a>
          ),
          candidate.portfolioUrl && (
            <a key="pf" href={candidate.portfolioUrl} target="_blank" rel="noopener noreferrer" className="underline">
              Portfolio
            </a>
          ),
        ]
          .filter(Boolean)
          .reduce<React.ReactNode[]>((acc, el, i) => {
            if (i > 0) acc.push(<span key={`sep-${i}`}> · </span>);
            acc.push(el);
            return acc;
          }, []) || "—",
    },
  ];
  return (
    <section>
      <SectionLabel>At a glance</SectionLabel>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
        {lines.map((line, i) => (
          <div key={i} className="contents">
            <dt className="text-xs text-zinc-500 uppercase tracking-wide self-center">{line.label}</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">{line.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ApplicationsControls({ applications }: { applications: ApplicationRow[] }) {
  if (applications.length === 0) {
    return (
      <section>
        <SectionLabel>Jobs</SectionLabel>
        <p className="text-sm text-zinc-500">Not associated with any job yet.</p>
      </section>
    );
  }
  return (
    <section>
      <SectionLabel>Jobs ({applications.length})</SectionLabel>
      <ul className="space-y-2">
        {applications.map((a) => (
          <ApplicationRowControl key={a.id} app={a} />
        ))}
      </ul>
    </section>
  );
}

function ApplicationRowControl({ app }: { app: ApplicationRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-sm">
      <Link
        href={`/jobs/${app.job.id}`}
        className="block font-medium hover:underline truncate"
      >
        {app.job.title}
      </Link>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <select
          value={app.stage}
          disabled={pending}
          onChange={(e) => startTransition(() => setApplicationStage(app.id, e.target.value as Stage))}
          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || app.stage === Stage.REJECTED}
          onClick={() => startTransition(() => setApplicationStage(app.id, Stage.REJECTED))}
          className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-1 text-xs disabled:opacity-40"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setApplicationStage(app.id, advance(app.stage)))}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2 py-1 text-xs disabled:opacity-50"
        >
          Advance →
        </button>
      </div>
    </li>
  );
}

function advance(stage: Stage): Stage {
  const order: Stage[] = [Stage.APPLIED, Stage.SCREEN, Stage.INTERVIEW, Stage.OFFER, Stage.HIRED];
  const i = order.indexOf(stage);
  if (i === -1 || i === order.length - 1) return stage;
  return order[i + 1];
}

function FollowUpRow({
  candidateId,
  nextFollowUpAt,
  lastContactedAt,
}: {
  candidateId: string;
  nextFollowUpAt: Date | null;
  lastContactedAt: Date | null;
}) {
  const [pending, startTransition] = useTransition();
  const value = nextFollowUpAt
    ? new Date(nextFollowUpAt).toISOString().slice(0, 10)
    : "";
  return (
    <section>
      <SectionLabel>Follow-up</SectionLabel>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={value}
          disabled={pending}
          onChange={(e) =>
            startTransition(() => setNextFollowUp(candidateId, e.target.value || null))
          }
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => markContactedNow(candidateId))}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Mark contacted
        </button>
      </div>
      <div className="mt-1 text-xs text-zinc-500">
        Last contacted:{" "}
        {lastContactedAt ? new Date(lastContactedAt).toLocaleDateString() : "never"}
      </div>
    </section>
  );
}

function QuickNote({
  candidateId,
  applications,
}: {
  candidateId: string;
  applications: ApplicationRow[];
}) {
  const bound = addQuickNote.bind(null, candidateId);
  const [state, action, pending] = useActionState<QuickNoteResult | undefined, FormData>(
    bound,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (applications.length === 0) {
    return (
      <section>
        <SectionLabel>Quick note</SectionLabel>
        <p className="text-sm text-zinc-500">
          Add this candidate to a job first — notes attach to an application.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionLabel>Quick note</SectionLabel>
      <form ref={formRef} action={action} className="space-y-2">
        {applications.length > 1 && (
          <select
            name="applicationId"
            defaultValue={applications[0].id}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
          >
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.job.title} ({STAGE_LABEL[a.stage]})
              </option>
            ))}
          </select>
        )}
        {applications.length === 1 && (
          <input type="hidden" name="applicationId" value={applications[0].id} />
        )}
        <textarea
          name="body"
          required
          rows={2}
          placeholder="Quick observation, decision rationale, follow-up plan…"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
        {state?.ok === false && (
          <p className="text-xs text-red-600">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save note"}
        </button>
      </form>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">
      {children}
    </div>
  );
}
