import Link from "next/link";
import { JobStatus, Stage } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { daysAgo, todayBounds } from "./_helpers";

/**
 * Hero KPI strip — four business-outcome numbers with 14-day trend
 * sparklines. Differs from Row 1 (which is "what's broken / due") by
 * focusing on the metrics a recruiter wants to brag about: open jobs,
 * candidates in active pipeline, hires this month, est. fees in pipeline.
 *
 * The sparklines are inline SVG (no chart lib). 14 daily buckets, ~0.5kB
 * each. Cheap.
 */

const SPARK_DAYS = 14;

export type KpiStripData = {
  openJobs: { current: number; series: number[] };
  activeCandidates: { current: number; series: number[] };
  hiresThisMonth: { current: number; series: number[] };
  pipelineFeesUsd: { current: number; series: number[] };
};

type DayBuckets = number[]; // length === SPARK_DAYS, oldest → newest

function makeDailyBuckets(rows: { createdAt: Date }[], origin: Date): DayBuckets {
  const buckets = new Array(SPARK_DAYS).fill(0);
  const start = new Date(origin);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (SPARK_DAYS - 1));
  for (const row of rows) {
    const diffMs = row.createdAt.getTime() - start.getTime();
    if (diffMs < 0) continue;
    const idx = Math.min(
      SPARK_DAYS - 1,
      Math.floor(diffMs / (24 * 60 * 60 * 1000)),
    );
    if (idx >= 0 && idx < SPARK_DAYS) buckets[idx] += 1;
  }
  return buckets;
}

export async function loadKpiStrip(orgId: string): Promise<KpiStripData> {
  const now = new Date();
  const fourteenAgo = daysAgo(SPARK_DAYS - 1, now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { endInclusive: endOfToday } = todayBounds(now);

  const [
    openJobsCount,
    openJobsSeriesRows,
    activeAppsCount,
    activeAppsSeriesRows,
    hiresThisMonth,
    hiresSeriesRows,
    pipelineApps,
  ] = await Promise.all([
    // Open jobs (current)
    prisma.job.count({
      where: { organizationId: orgId, status: JobStatus.OPEN },
    }),
    // Jobs created in the last 14d (for the trend)
    prisma.job.findMany({
      where: { organizationId: orgId, createdAt: { gte: fourteenAgo } },
      select: { createdAt: true },
    }),
    // Active candidates = distinct candidates with at least one
    // not-yet-closed application. Counted via Application to avoid
    // bringing back every candidate row.
    prisma.application
      .findMany({
        where: {
          organizationId: orgId,
          stage: { in: [Stage.APPLIED, Stage.SCREEN, Stage.INTERVIEW, Stage.OFFER] },
        },
        select: { candidateId: true },
        distinct: ["candidateId"],
      })
      .then((rows) => rows.length),
    // Applications created in the last 14d (proxy for "new candidates
    // entering the pipeline" — sparkline shape)
    prisma.application.findMany({
      where: { organizationId: orgId, createdAt: { gte: fourteenAgo } },
      select: { createdAt: true },
    }),
    // Hires this calendar month
    prisma.application.count({
      where: {
        organizationId: orgId,
        stage: Stage.HIRED,
        updatedAt: { gte: monthStart, lte: endOfToday },
      },
    }),
    // Daily hire rows for the trend (use updatedAt, since stage moves
    // are not their own table — this is good-enough for the sparkline).
    prisma.application.findMany({
      where: {
        organizationId: orgId,
        stage: Stage.HIRED,
        updatedAt: { gte: fourteenAgo },
      },
      select: { updatedAt: true },
    }),
    // Pipeline fees — applications still in flight (INTERVIEW + OFFER),
    // joined with the Job to read salaryLow × placementFeePercent.
    // Includes both stages so the number reflects real near-term revenue.
    prisma.application.findMany({
      where: {
        organizationId: orgId,
        stage: { in: [Stage.INTERVIEW, Stage.OFFER] },
      },
      select: {
        createdAt: true,
        job: { select: { salaryLow: true, placementFeePercent: true } },
      },
    }),
  ]);

  const pipelineFeesUsd = pipelineApps.reduce((sum, a) => {
    const low = a.job?.salaryLow ?? 0;
    const pct = a.job?.placementFeePercent ?? 0;
    return sum + Math.round((low * pct) / 100);
  }, 0);

  // For the fees sparkline, bucket by application createdAt — same shape
  // as "pipeline growth" over time, weighted by deal value.
  const feesSeries: DayBuckets = new Array(SPARK_DAYS).fill(0);
  {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (SPARK_DAYS - 1));
    for (const a of pipelineApps) {
      const idx = Math.floor(
        (a.createdAt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (idx >= 0 && idx < SPARK_DAYS) {
        const low = a.job?.salaryLow ?? 0;
        const pct = a.job?.placementFeePercent ?? 0;
        feesSeries[idx] += Math.round((low * pct) / 100);
      }
    }
  }

  // Sparkline shape for "active candidates" — daily app creations are
  // the best stand-in for "new candidates joining pipeline" without
  // adding a new audit table.
  const activeSeries = makeDailyBuckets(activeAppsSeriesRows, now);

  // Replace the last bucket with the live "current" number to anchor
  // the rightmost point to the headline value. For the open-jobs series
  // (a stock, not a flow) we cumulatively roll forward from creations,
  // then overwrite today with the live count.
  const openJobsCreated = makeDailyBuckets(openJobsSeriesRows, now);
  const openJobsSeries = cumulative(openJobsCreated);
  openJobsSeries[openJobsSeries.length - 1] = openJobsCount;

  const hiresSeries = makeDailyBuckets(
    hiresSeriesRows.map((r) => ({ createdAt: r.updatedAt })),
    now,
  );

  return {
    openJobs: { current: openJobsCount, series: openJobsSeries },
    activeCandidates: { current: activeAppsCount, series: activeSeries },
    hiresThisMonth: { current: hiresThisMonth, series: hiresSeries },
    pipelineFeesUsd: { current: pipelineFeesUsd, series: feesSeries },
  };
}

function cumulative(arr: number[]): number[] {
  const out = new Array(arr.length).fill(0);
  let running = 0;
  for (let i = 0; i < arr.length; i++) {
    running += arr[i];
    out[i] = running;
  }
  return out;
}

// ---------- Rendering ----------

const KPIS: Array<{
  key: keyof KpiStripData;
  label: string;
  href: string;
  format: (n: number) => string;
  tone: { ring: string; spark: string };
}> = [
  {
    key: "openJobs",
    label: "Open jobs",
    href: "/jobs",
    format: (n) => n.toLocaleString(),
    tone: {
      ring: "hover:ring-sky-200/60 dark:hover:ring-sky-900/40",
      spark: "text-sky-500 dark:text-sky-400",
    },
  },
  {
    key: "activeCandidates",
    label: "Active candidates",
    href: "/candidates",
    format: (n) => n.toLocaleString(),
    tone: {
      ring: "hover:ring-indigo-200/60 dark:hover:ring-indigo-900/40",
      spark: "text-indigo-500 dark:text-indigo-400",
    },
  },
  {
    key: "hiresThisMonth",
    label: "Hires this month",
    href: "/jobs",
    format: (n) => n.toLocaleString(),
    tone: {
      ring: "hover:ring-emerald-200/60 dark:hover:ring-emerald-900/40",
      spark: "text-emerald-500 dark:text-emerald-400",
    },
  },
  {
    key: "pipelineFeesUsd",
    label: "Est. fees in pipeline",
    href: "/jobs",
    format: formatUSDCompact,
    tone: {
      ring: "hover:ring-amber-200/60 dark:hover:ring-amber-900/40",
      spark: "text-amber-500 dark:text-amber-400",
    },
  },
];

function formatUSDCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `$${n.toLocaleString()}`;
}

export function KpiStrip({ data }: { data: KpiStripData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {KPIS.map((kpi) => {
        const series = data[kpi.key].series;
        const current = data[kpi.key].current;
        const delta = trendDelta(series);
        return (
          <Link
            key={kpi.key}
            href={kpi.href}
            className={`
              group relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800
              bg-white dark:bg-zinc-900 p-4
              transition-all duration-150
              shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.9)]
              dark:shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]
              hover:-translate-y-0.5
              hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.15)]
              dark:hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.6)]
              hover:ring-2 ${kpi.tone.ring}
            `}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] uppercase tracking-wider font-medium text-zinc-500">
                {kpi.label}
              </div>
              {delta !== null && (
                <span
                  className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                    delta > 0
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : delta < 0
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                  title="Change vs first half of the 14-day window"
                >
                  {delta > 0 ? "↑" : delta < 0 ? "↓" : "·"} {Math.abs(delta)}%
                </span>
              )}
            </div>
            <div className="mt-1 text-3xl font-semibold tabular-nums">
              {kpi.format(current)}
            </div>
            <Sparkline values={series} colorClass={kpi.tone.spark} />
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Percent change between the first half of the window and the second half.
 * Returns null when there's not enough signal (e.g., both halves zero).
 */
function trendDelta(series: number[]): number | null {
  if (series.length < 4) return null;
  const half = Math.floor(series.length / 2);
  const a = series.slice(0, half).reduce((s, n) => s + n, 0);
  const b = series.slice(half).reduce((s, n) => s + n, 0);
  if (a === 0 && b === 0) return null;
  if (a === 0) return 100;
  return Math.round(((b - a) / a) * 100);
}

function Sparkline({ values, colorClass }: { values: number[]; colorClass: string }) {
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 28;
  const step = w / Math.max(1, values.length - 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * h).toFixed(2)}`)
    .join(" ");
  // Area fill polygon: same points + bottom-right + bottom-left.
  const area = `0,${h} ${points} ${w},${h}`;
  return (
    <div className={`mt-2 ${colorClass}`}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full h-7 block"
        aria-hidden="true"
      >
        <polygon points={area} className="fill-current opacity-15" />
        <polyline
          points={points}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-current"
        />
      </svg>
    </div>
  );
}
