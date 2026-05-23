import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { JobStatus, Stage } from "@/generated/prisma";
import { panelClass } from "./_helpers";

const STAGE_ORDER: Stage[] = [
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

// Six stages, walking down through the recruiting funnel — emerald at the
// top (healthy pipeline), red for rejected.
const STAGE_BAR: Record<Stage, string> = {
  APPLIED: "bg-gradient-to-r from-emerald-400 to-emerald-500",
  SCREEN: "bg-gradient-to-r from-sky-400 to-sky-500",
  INTERVIEW: "bg-gradient-to-r from-indigo-400 to-indigo-500",
  OFFER: "bg-gradient-to-r from-violet-400 to-violet-500",
  HIRED: "bg-gradient-to-r from-emerald-500 to-emerald-600",
  REJECTED: "bg-gradient-to-r from-red-400 to-red-500",
};

export type PipelineFunnelData = {
  counts: Record<Stage, number>;
  total: number;
  max: number;
};

export async function loadPipelineFunnel(): Promise<PipelineFunnelData> {
  const rows = await prisma.application.groupBy({
    by: ["stage"],
    where: { job: { status: JobStatus.OPEN } },
    _count: { _all: true },
  });

  const counts: Record<Stage, number> = {
    APPLIED: 0,
    SCREEN: 0,
    INTERVIEW: 0,
    OFFER: 0,
    HIRED: 0,
    REJECTED: 0,
  };
  for (const r of rows) counts[r.stage] = r._count._all;

  const total = STAGE_ORDER.reduce((acc, s) => acc + counts[s], 0);
  const max = Math.max(...STAGE_ORDER.map((s) => counts[s]), 1);

  return { counts, total, max };
}

export function PipelineFunnel({ data }: { data: PipelineFunnelData }) {
  return (
    <section className={panelClass}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Pipeline
        </h2>
        <span className="text-xs text-zinc-500">
          {data.total} total · open jobs only
        </span>
      </div>
      {data.total === 0 ? (
        <p className="text-sm text-zinc-500">
          No applications on open jobs yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {STAGE_ORDER.map((stage) => {
            const count = data.counts[stage];
            const widthPct = (count / data.max) * 100;
            return (
              <li key={stage}>
                <Link
                  href={`/candidates`}
                  className="block group"
                  aria-label={`${STAGE_LABEL[stage]}: ${count}`}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <span className="w-20 shrink-0 text-zinc-600 dark:text-zinc-300">
                      {STAGE_LABEL[stage]}
                    </span>
                    <div className="flex-1 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full ${STAGE_BAR[stage]} transition-all`}
                        style={{ width: count > 0 ? `${Math.max(widthPct, 4)}%` : "0%" }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums font-medium text-zinc-700 dark:text-zinc-200">
                      {count}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
