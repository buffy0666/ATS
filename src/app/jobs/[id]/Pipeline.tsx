"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Stage } from "@/generated/prisma";
import { updateApplicationStage } from "../actions";

type App = {
  id: string;
  stage: Stage;
  candidate: { id: string; firstName: string; lastName: string; email: string };
};

const STAGE_LABEL: Record<Stage, string> = {
  APPLIED: "Applied",
  SCREEN: "Screen",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

export function Pipeline({
  stages,
  applications,
}: {
  stages: Stage[];
  applications: App[];
}) {
  const byStage: Record<Stage, App[]> = {
    APPLIED: [],
    SCREEN: [],
    INTERVIEW: [],
    OFFER: [],
    HIRED: [],
    REJECTED: [],
  };
  applications.forEach((a) => byStage[a.stage].push(a));

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stages.map((stage) => (
        <div
          key={stage}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-950 p-3 min-h-40"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wide font-semibold text-zinc-500">
              {STAGE_LABEL[stage]}
            </h3>
            <span className="text-xs tabular-nums text-zinc-500">{byStage[stage].length}</span>
          </div>
          <div className="space-y-2">
            {byStage[stage].map((app) => (
              <Card key={app.id} app={app} stages={stages} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ app, stages }: { app: App; stages: Stage[] }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-sm">
      <Link
        href={`/candidates/${app.candidate.id}`}
        className="font-medium hover:underline block"
      >
        {app.candidate.firstName} {app.candidate.lastName}
      </Link>
      <p className="text-xs text-zinc-500 truncate">{app.candidate.email}</p>
      <select
        value={app.stage}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Stage;
          startTransition(() => updateApplicationStage(app.id, next));
        }}
        className="mt-2 w-full rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1 text-xs"
      >
        {stages.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <Link
        href={`/interviews/new?candidateId=${app.candidate.id}&applicationId=${app.id}`}
        className="mt-2 block text-center rounded border border-zinc-200 dark:border-zinc-700 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Schedule
      </Link>
    </div>
  );
}
