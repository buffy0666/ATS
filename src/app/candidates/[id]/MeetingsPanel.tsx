"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { InterviewStatus, InterviewType } from "@/generated/prisma";
import { logMeeting } from "./meetings-actions";

export type MeetingRow = {
  id: string;
  title: string;
  type: InterviewType;
  status: InterviewStatus;
  startAt: Date;
  endAt: Date;
  location: string | null;
  videoUrl: string | null;
  description: string | null;
  organizer: { name: string | null; email: string } | null;
};

const TYPE_LABEL: Record<InterviewType, string> = {
  PHONE_SCREEN: "Phone screen",
  TECHNICAL: "Technical",
  ONSITE: "Onsite",
  FINAL: "Final",
  CULTURE_FIT: "Culture fit",
  OTHER: "Other",
};

const STATUS_BADGE: Record<InterviewStatus, string> = {
  SCHEDULED: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  CANCELED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  NO_SHOW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  RESCHEDULED: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
};

/**
 * Meetings tab content. Combines two surfaces:
 *  - "Schedule" jumps to /interviews/new with the candidate prefilled.
 *  - "Log" opens an inline form to record a meeting that already
 *    happened — saved as a COMPLETED Interview row with a timestamp +
 *    notes so it shows up alongside the scheduled ones.
 * The list below shows every interview row for this candidate in
 * reverse-chronological order.
 */
export function MeetingsPanel({
  candidateId,
  meetings,
}: {
  candidateId: string;
  meetings: MeetingRow[];
}) {
  const [logOpen, setLogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleLog(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await logMeeting(candidateId, formData);
      if (res.ok) {
        setLogOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Meetings ({meetings.length})
        </h2>
        <Link
          href={`/interviews/new?candidateId=${candidateId}`}
          className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Schedule
        </Link>
        <button
          type="button"
          onClick={() => setLogOpen((v) => !v)}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {logOpen ? "Cancel log" : "Log"}
        </button>
      </div>

      {logOpen && (
        <form
          action={handleLog}
          className="mb-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-zinc-600 dark:text-zinc-300">
                Title
              </span>
              <input
                name="title"
                required
                placeholder="Intro call"
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-zinc-600 dark:text-zinc-300">
                When
              </span>
              <input
                name="occurredAt"
                type="datetime-local"
                required
                defaultValue={localNow()}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-zinc-600 dark:text-zinc-300">
                Duration (minutes)
              </span>
              <input
                name="durationMinutes"
                type="number"
                min={0}
                max={1440}
                defaultValue={30}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-zinc-600 dark:text-zinc-300">
                Type
              </span>
              <select
                name="type"
                defaultValue={InterviewType.OTHER}
                className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                {(Object.keys(TYPE_LABEL) as InterviewType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-zinc-600 dark:text-zinc-300">Notes</span>
            <textarea
              name="notes"
              rows={3}
              placeholder="What was discussed, follow-ups, etc."
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {pending ? "Saving…" : "Save meeting"}
            </button>
            <button
              type="button"
              onClick={() => setLogOpen(false)}
              disabled={pending}
              className="rounded-md px-3 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {meetings.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No meetings yet. Click <span className="font-medium">Schedule</span> to set one up, or{" "}
          <span className="font-medium">Log</span> to record one that already happened.
        </p>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <li
              key={m.id}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/interviews/${m.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {m.title}
                  </Link>
                  <span className="ml-2 text-xs text-zinc-500">{TYPE_LABEL[m.type]}</span>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE[m.status]}`}
                >
                  {m.status.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {m.startAt.toLocaleString()}
                {m.organizer && (
                  <>
                    {" · "}
                    <span>{m.organizer.name ?? m.organizer.email}</span>
                  </>
                )}
                {m.location && (
                  <>
                    {" · "}
                    <span>{m.location}</span>
                  </>
                )}
              </div>
              {m.description && (
                <p className="mt-1.5 whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
                  {m.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** datetime-local default = now in the user's local timezone, no seconds. */
function localNow(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
}
