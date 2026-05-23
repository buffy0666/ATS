"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SequenceStepType } from "@/generated/prisma";
import { completeStepRun } from "../actions";

export type StepRunDue = {
  id: string;
  scheduledFor: Date;
  type: SequenceStepType;
  typeLabel: string;
  taskTitle: string;
  taskInstructions: string;
  candidate: { id: string; name: string; email: string; phone: string | null };
  sequence: { id: string; name: string };
};

const TYPE_ICON: Record<SequenceStepType, string> = {
  EMAIL: "✉",
  CALL: "📞",
  TEXT: "💬",
  LINKEDIN: "in",
  TASK: "✓",
};

export function StepRunRow({ run }: { run: StepRunDue }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function markDone() {
    setError(null);
    startTransition(async () => {
      const r = await completeStepRun(run.id, outcome);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setExpanded(false);
      setOutcome("");
      router.refresh();
    });
  }

  return (
    <li className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden
          className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-sm"
        >
          {TYPE_ICON[run.type]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-wide text-zinc-500">
              {run.typeLabel}
            </span>
            <Link
              href={`/candidates/${run.candidate.id}`}
              className="text-sm font-medium hover:underline"
            >
              {run.candidate.name}
            </Link>
            <span className="text-xs text-zinc-500">
              · {run.sequence.name}
            </span>
            <span className="text-xs text-zinc-400 ml-auto">
              {dueLabel(run.scheduledFor)}
            </span>
          </div>
          <div className="mt-1 text-sm">{run.taskTitle}</div>
          {run.taskInstructions && (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
              {run.taskInstructions}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((s) => !s)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              {expanded ? "Hide" : "Mark done"}
            </button>
            {run.candidate.email && (
              <span className="text-xs text-zinc-500">{run.candidate.email}</span>
            )}
            {run.candidate.phone && (
              <span className="text-xs text-zinc-500">{run.candidate.phone}</span>
            )}
          </div>
          {expanded && (
            <div className="mt-3 space-y-2">
              <textarea
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                rows={2}
                placeholder="Outcome — left voicemail, booked screen, etc. (optional)"
                maxLength={2000}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
              />
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={markDone}
                  disabled={pending}
                  className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Mark done"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false);
                    setOutcome("");
                    setError(null);
                  }}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function dueLabel(when: Date): string {
  const now = Date.now();
  const ms = when.getTime() - now;
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (ms <= 0) {
    const overdueDays = Math.abs(days);
    if (overdueDays === 0) return "due today";
    return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
  }
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}
