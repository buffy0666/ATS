"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelEnrollment,
  enrollCandidateInSequence,
  pauseEnrollment,
  resumeEnrollment,
} from "../../sequences/actions";
import { EnrollmentStatus } from "@/generated/prisma";

export type CandidateEnrollment = {
  id: string;
  status: EnrollmentStatus;
  startedAt: Date;
  sequence: { id: string; name: string };
  totalSteps: number;
  completedSteps: number;
  nextScheduledFor: Date | null;
};

export type SequenceOption = { id: string; name: string };
export type ApplicationOption = { id: string; jobTitle: string };

const STATUS_BADGE: Record<EnrollmentStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  PAUSED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  COMPLETED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  CANCELED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export function CandidateSequencesSection({
  candidateId,
  enrollments,
  availableSequences,
  applications,
}: {
  candidateId: string;
  enrollments: CandidateEnrollment[];
  availableSequences: SequenceOption[];
  applications: ApplicationOption[];
}) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState(false);
  const [pickedSequence, setPickedSequence] = useState(
    availableSequences[0]?.id ?? "",
  );
  const [pickedApplication, setPickedApplication] = useState("");
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function showBanner(tone: "ok" | "err", text: string) {
    setBanner({ tone, text });
    setTimeout(() => setBanner(null), 4000);
  }

  function submitEnroll() {
    if (!pickedSequence) return;
    startTransition(async () => {
      const r = await enrollCandidateInSequence(
        candidateId,
        pickedSequence,
        pickedApplication || null,
      );
      showBanner(r.ok ? "ok" : "err", r.message);
      if (r.ok) {
        setEnrolling(false);
        setPickedApplication("");
        router.refresh();
      }
    });
  }

  function runEnrollmentAction(
    fn: () => Promise<{ ok: boolean; message: string }>,
    confirmText?: string,
  ) {
    if (confirmText && !confirm(confirmText)) return;
    startTransition(async () => {
      const r = await fn();
      showBanner(r.ok ? "ok" : "err", r.message);
      router.refresh();
    });
  }

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Sequences
        </h2>
        <button
          type="button"
          onClick={() => setEnrolling((s) => !s)}
          disabled={availableSequences.length === 0}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {enrolling ? "Cancel" : "Enroll in sequence"}
        </button>
      </div>

      {banner && (
        <p
          className={`mb-3 text-sm ${
            banner.tone === "ok"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
          aria-live="polite"
        >
          {banner.text}
        </p>
      )}

      {enrolling && (
        <div className="mb-4 rounded-md border border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
                Sequence
              </span>
              <select
                value={pickedSequence}
                onChange={(e) => setPickedSequence(e.target.value)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              >
                {availableSequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
                Link to application (optional)
              </span>
              <select
                value={pickedApplication}
                onChange={(e) => setPickedApplication(e.target.value)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              >
                <option value="">— None —</option>
                {applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.jobTitle}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Linking to an application lets <code>{"{{job.title}}"}</code> resolve in templated
            emails.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitEnroll}
              disabled={pending || !pickedSequence}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Enrolling…" : "Enroll"}
            </button>
            <button
              type="button"
              onClick={() => setEnrolling(false)}
              disabled={pending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {enrollments.length === 0 ? (
        <p className="text-sm text-zinc-500">Not enrolled in any sequence.</p>
      ) : (
        <ul className="space-y-2">
          {enrollments.map((e) => (
            <li
              key={e.id}
              className="flex items-start gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{e.sequence.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[e.status]}`}
                  >
                    {e.status.toLowerCase()}
                  </span>
                  <span className="text-xs text-zinc-500">
                    step {e.completedSteps} / {e.totalSteps}
                  </span>
                  {e.nextScheduledFor && (
                    <span className="text-xs text-zinc-500">
                      next {describeWhen(e.nextScheduledFor)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {e.status === EnrollmentStatus.ACTIVE && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runEnrollmentAction(() => pauseEnrollment(e.id))}
                    className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Pause
                  </button>
                )}
                {e.status === EnrollmentStatus.PAUSED && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runEnrollmentAction(() => resumeEnrollment(e.id))}
                    className="rounded-md border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                  >
                    Resume
                  </button>
                )}
                {(e.status === EnrollmentStatus.ACTIVE ||
                  e.status === EnrollmentStatus.PAUSED) && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      runEnrollmentAction(
                        () => cancelEnrollment(e.id),
                        "Cancel this enrollment? Pending emails will be canceled with Resend.",
                      )
                    }
                    className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-0.5 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describeWhen(when: Date): string {
  const ms = when.getTime() - Date.now();
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (ms <= 0) return "now";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}
