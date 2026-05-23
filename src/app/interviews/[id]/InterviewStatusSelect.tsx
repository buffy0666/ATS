"use client";

import { useTransition } from "react";
import { InterviewStatus } from "@/generated/prisma";
import { setInterviewStatus } from "../actions";

const STATUS_LABEL: Record<InterviewStatus, string> = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
  NO_SHOW: "No-show",
  RESCHEDULED: "Rescheduled",
};

export function InterviewStatusSelect({
  interviewId,
  currentStatus,
}: {
  interviewId: string;
  currentStatus: InterviewStatus;
}) {
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as InterviewStatus;
    if (next === currentStatus) return;
    startTransition(() => setInterviewStatus(interviewId, next));
  }

  return (
    <select
      defaultValue={currentStatus}
      onChange={onChange}
      disabled={pending}
      className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs disabled:opacity-50"
      aria-label="Change interview status"
    >
      {(Object.keys(STATUS_LABEL) as InterviewStatus[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
