"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Stage } from "@/generated/prisma";
import { MERGE_FIELD_GROUPS, type MergeFieldGroup, type MergeFieldKind } from "./fields";
import { mergeCandidates } from "./actions";

export type CandidateSummary = {
  id: string;
  label: string;
  email: string;
  createdAtIso: string;
  createdAtDisplay: string;
  completeness: number;
  hasEeo: boolean;
  counts: {
    notes: number;
    emails: number;
    contactLogs: number;
    applications: number;
    interviews: number;
    enrollments: number;
    listMemberships: number;
    documents: number;
    references: number;
    activities: number;
    tags: number;
  };
};

export type FieldRow = {
  key: string;
  label: string;
  group: MergeFieldGroup;
  kind: MergeFieldKind;
  a: string | null;
  b: string | null;
  aEmpty: boolean;
  bEmpty: boolean;
  differ: boolean;
};

export type AppConflict = {
  jobId: string;
  jobTitle: string;
  aStage: Stage;
  bStage: Stage;
};

type Col = "a" | "b";

// Pipeline order — higher = further along. REJECTED is treated as the least
// advanced so an active application always wins the "furthest-along" default.
const STAGE_RANK: Record<string, number> = {
  REJECTED: 0,
  APPLIED: 1,
  SCREEN: 2,
  INTERVIEW: 3,
  OFFER: 4,
  HIRED: 5,
};

const STAGE_LABEL: Record<string, string> = {
  APPLIED: "Applied",
  SCREEN: "Screen",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

export function MergeClient({
  a,
  b,
  fields,
  conflicts,
  defaultPrimary,
}: {
  a: CandidateSummary;
  b: CandidateSummary;
  fields: FieldRow[];
  conflicts: AppConflict[];
  defaultPrimary: Col;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [primary, setPrimary] = useState<Col>(defaultPrimary);

  // Per-field winner column. Recomputed whenever the primary flips: default
  // to the primary's value, but fall back to the secondary where the primary
  // is empty and the secondary has something.
  function defaultFieldWinners(prim: Col): Record<string, Col> {
    const secondary: Col = prim === "a" ? "b" : "a";
    const out: Record<string, Col> = {};
    for (const f of fields) {
      if (!f.differ) {
        out[f.key] = prim;
        continue;
      }
      const primEmpty = prim === "a" ? f.aEmpty : f.bEmpty;
      const secEmpty = prim === "a" ? f.bEmpty : f.aEmpty;
      out[f.key] = primEmpty && !secEmpty ? secondary : prim;
    }
    return out;
  }

  const [fieldWinners, setFieldWinners] = useState<Record<string, Col>>(() =>
    defaultFieldWinners(defaultPrimary),
  );

  // Application conflicts default to the furthest-along stage, independent of
  // the primary selection.
  const [appWinners, setAppWinners] = useState<Record<string, Col>>(() => {
    const out: Record<string, Col> = {};
    for (const c of conflicts) {
      out[c.jobId] = (STAGE_RANK[c.aStage] ?? 0) >= (STAGE_RANK[c.bStage] ?? 0) ? "a" : "b";
    }
    return out;
  });

  function changePrimary(next: Col) {
    setPrimary(next);
    setFieldWinners(defaultFieldWinners(next));
  }

  const primarySummary = primary === "a" ? a : b;
  const secondarySummary = primary === "a" ? b : a;
  const colLabel = (col: Col) => (col === "a" ? a.label : b.label);
  const colSummary = (col: Col) => (col === "a" ? a : b);

  const differingFields = fields.filter((f) => f.differ);

  function submit() {
    setError(null);
    const primaryId = primary === "a" ? a.id : b.id;
    const secondaryId = primary === "a" ? b.id : a.id;

    const fieldChoices: Record<string, "primary" | "secondary"> = {};
    for (const f of differingFields) {
      fieldChoices[f.key] = fieldWinners[f.key] === primary ? "primary" : "secondary";
    }
    const applicationChoices: Record<string, "primary" | "secondary"> = {};
    for (const c of conflicts) {
      applicationChoices[c.jobId] = appWinners[c.jobId] === primary ? "primary" : "secondary";
    }

    if (
      !confirm(
        `This permanently deletes "${secondarySummary.label}" and merges everything into "${primarySummary.label}". This can't be undone.\n\nContinue?`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const res = await mergeCandidates({ primaryId, secondaryId, fieldChoices, applicationChoices });
      if (res.ok) {
        router.push(`/candidates/${res.primaryId}`);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Primary selector */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold">Which record survives?</h2>
        <p className="mt-1 text-xs text-zinc-500">
          The primary record is kept; the other is deleted after its data is merged in.
          {a.completeness !== b.completeness ? (
            <>
              {" "}
              <strong>{(a.completeness > b.completeness ? a : b).label}</strong> has more complete
              data — defaulting to it.
            </>
          ) : (
            <> Both look similarly complete — defaulting to the older record.</>
          )}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["a", "b"] as Col[]).map((col) => {
            const c = colSummary(col);
            const isPrimary = primary === col;
            return (
              <button
                key={col}
                type="button"
                onClick={() => changePrimary(col)}
                aria-pressed={isPrimary}
                className={`rounded-md border p-3 text-left transition ${
                  isPrimary
                    ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      isPrimary
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {isPrimary ? "Primary (survives)" : "Secondary (deleted)"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">{c.email}</div>
                <div className="mt-1 text-xs text-zinc-400">
                  {c.completeness} fields filled · added {c.createdAtDisplay}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Application conflicts — require an explicit choice */}
      {conflicts.length > 0 && (
        <section className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Same-job applications — choose which to keep
          </h2>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
            Both candidates applied to {conflicts.length === 1 ? "this job" : "these jobs"}. Only one
            application per job can survive. The other&apos;s notes, emails, interviews, and sequence
            enrollments move onto the one you keep before it&apos;s removed. Defaulted to the
            furthest-along stage.
          </p>
          <div className="mt-3 space-y-3">
            {conflicts.map((c) => (
              <div
                key={c.jobId}
                className="rounded-md border border-amber-200 dark:border-amber-900 bg-white dark:bg-zinc-900 p-3"
              >
                <div className="text-sm font-medium">{c.jobTitle}</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(["a", "b"] as Col[]).map((col) => {
                    const stage = col === "a" ? c.aStage : c.bStage;
                    const selected = appWinners[c.jobId] === col;
                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setAppWinners((prev) => ({ ...prev, [c.jobId]: col }))}
                        aria-pressed={selected}
                        className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                          selected
                            ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{colLabel(col)}</span>
                          {col === primary ? (
                            <span className="text-xs text-emerald-700 dark:text-emerald-300">primary</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          Stage: {STAGE_LABEL[stage] ?? stage}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Field comparison */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Compare fields</h2>
          <p className="text-xs text-zinc-500">
            {differingFields.length === 0
              ? "No conflicting field values."
              : `${differingFields.length} field${differingFields.length === 1 ? "" : "s"} differ — pick a winner for each.`}
          </p>
        </div>

        {MERGE_FIELD_GROUPS.map((group) => {
          const groupFields = fields.filter((f) => f.group === group);
          if (groupFields.length === 0) return null;
          return (
            <div
              key={group}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
            >
              <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{group}</h3>
              </div>
              {/* Column headers */}
              <div className="grid grid-cols-[10rem_1fr_1fr] gap-2 border-b border-zinc-100 dark:border-zinc-800/60 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                <span />
                <span>
                  {a.label} {primary === "a" && <em className="not-italic text-emerald-600">· primary</em>}
                </span>
                <span>
                  {b.label} {primary === "b" && <em className="not-italic text-emerald-600">· primary</em>}
                </span>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {groupFields.map((f) => (
                  <FieldComparisonRow
                    key={f.key}
                    field={f}
                    winner={fieldWinners[f.key]}
                    onPick={(col) => setFieldWinners((prev) => ({ ...prev, [f.key]: col }))}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* What happens summary */}
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-4">
        <h2 className="text-sm font-semibold">What happens when you merge</h2>

        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Chosen */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Chosen field values
            </h3>
            {differingFields.length === 0 ? (
              <p className="mt-1 text-xs text-zinc-500">
                All field values are identical — {primarySummary.label}&apos;s values are kept.
              </p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                {differingFields.map((f) => {
                  const winnerCol = fieldWinners[f.key];
                  const winnerVal = winnerCol === "a" ? f.a : f.b;
                  return (
                    <li key={f.key}>
                      <span className="font-medium">{f.label}:</span>{" "}
                      {winnerVal ?? <span className="italic text-zinc-400">empty</span>}{" "}
                      <span className="text-zinc-400">(from {colLabel(winnerCol)})</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <ul className="mt-2 space-y-1 text-xs text-zinc-500">
              <li>Free-text notes from both records are concatenated.</li>
              <li>Last-contacted keeps the more recent date; next follow-up keeps the soonest upcoming.</li>
              {primarySummary.hasEeo ? (
                <li>EEO data: {primarySummary.label}&apos;s is kept{secondarySummary.hasEeo ? " (the other is discarded)" : ""}.</li>
              ) : secondarySummary.hasEeo ? (
                <li>EEO data: transferred from {secondarySummary.label}.</li>
              ) : null}
            </ul>
          </div>

          {/* Combined / transferred */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Combined &amp; transferred onto {primarySummary.label}
            </h3>
            <ul className="mt-1 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
              <CombineLine label="Notes" p={primarySummary.counts.notes} s={secondarySummary.counts.notes} />
              <CombineLine label="Emails & correspondence" p={primarySummary.counts.emails} s={secondarySummary.counts.emails} />
              <CombineLine label="Contact log entries" p={primarySummary.counts.contactLogs} s={secondarySummary.counts.contactLogs} />
              <CombineLine
                label="Applications"
                p={primarySummary.counts.applications}
                s={secondarySummary.counts.applications}
                note={conflicts.length > 0 ? `${conflicts.length} de-duped by job` : undefined}
              />
              <CombineLine label="Interviews" p={primarySummary.counts.interviews} s={secondarySummary.counts.interviews} />
              <CombineLine label="Sequence enrollments" p={primarySummary.counts.enrollments} s={secondarySummary.counts.enrollments} note="de-duped by sequence" />
              <CombineLine label="List memberships" p={primarySummary.counts.listMemberships} s={secondarySummary.counts.listMemberships} note="de-duped by list" />
              <CombineLine label="Tags" p={primarySummary.counts.tags} s={secondarySummary.counts.tags} note="unioned" />
              <CombineLine label="Documents" p={primarySummary.counts.documents} s={secondarySummary.counts.documents} />
              <CombineLine label="References" p={primarySummary.counts.references} s={secondarySummary.counts.references} />
              <CombineLine label="Activity history" p={primarySummary.counts.activities} s={secondarySummary.counts.activities} />
              <li className="text-zinc-500">Custom field values transferred where {primarySummary.label} has none.</li>
            </ul>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/candidates")}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Merging…" : `Merge into ${primarySummary.label}`}
        </button>
      </div>
    </div>
  );
}

function FieldComparisonRow({
  field,
  winner,
  onPick,
}: {
  field: FieldRow;
  winner: Col;
  onPick: (col: Col) => void;
}) {
  // Identical values render collapsed and non-interactive.
  if (!field.differ) {
    const shared = field.a ?? field.b;
    return (
      <div className="grid grid-cols-[10rem_1fr] gap-2 px-4 py-2">
        <span className="text-xs font-medium text-zinc-500">{field.label}</span>
        <span className="text-sm text-zinc-500">
          {shared ?? <span className="italic text-zinc-400">—</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[10rem_1fr_1fr] gap-2 px-4 py-2">
      <span className="pt-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200">{field.label}</span>
      {(["a", "b"] as Col[]).map((col) => {
        const val = col === "a" ? field.a : field.b;
        const selected = winner === col;
        return (
          <button
            key={col}
            type="button"
            onClick={() => onPick(col)}
            aria-pressed={selected}
            className={`max-h-40 overflow-auto rounded-md border px-3 py-1.5 text-left text-sm transition ${
              selected
                ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
                : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            {val != null ? (
              <span className="whitespace-pre-wrap break-words">{val}</span>
            ) : (
              <span className="italic text-zinc-400">empty</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CombineLine({ label, p, s, note }: { label: string; p: number; s: number; note?: string }) {
  if (p === 0 && s === 0) {
    return (
      <li className="text-zinc-400">
        {label}: none
      </li>
    );
  }
  return (
    <li>
      <span className="font-medium">{label}:</span> {p} + {s}
      {note ? <span className="text-zinc-400"> ({note})</span> : null}
    </li>
  );
}
