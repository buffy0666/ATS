import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Stage } from "@/generated/prisma";
import { CardEmpty, CardHeader, CardViewAll } from "./CardChrome";
import { daysAgo, daysBetween, shimmerCardClass } from "./_helpers";

type StaleItem = {
  id: string;
  jobId: string;
  candidateName: string;
  jobTitle: string;
  stage: Stage;
  stuckDays: number;
};

export type StaleApplicationsData = {
  count: number;
  preview: StaleItem[];
};

export async function loadStaleApplications(): Promise<StaleApplicationsData> {
  const now = new Date();
  const cutoff = daysAgo(14, now);

  const where = {
    stage: { notIn: [Stage.HIRED, Stage.REJECTED] },
    updatedAt: { lt: cutoff },
  };

  const [apps, count] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { updatedAt: "asc" },
      take: 5,
      select: {
        id: true,
        stage: true,
        updatedAt: true,
        candidate: { select: { firstName: true, lastName: true } },
        job: { select: { id: true, title: true } },
      },
    }),
    prisma.application.count({ where }),
  ]);

  return {
    count,
    preview: apps.map((a) => ({
      id: a.id,
      jobId: a.job.id,
      candidateName: `${a.candidate.firstName} ${a.candidate.lastName}`,
      jobTitle: a.job.title,
      stage: a.stage,
      stuckDays: daysBetween(a.updatedAt, now),
    })),
  };
}

export function StaleApplicationsCard({ data }: { data: StaleApplicationsData }) {
  return (
    <Link href="/jobs" className={shimmerCardClass(data.count)}>
      <CardHeader label="Stale applications" count={data.count} />
      {data.count === 0 ? (
        <CardEmpty text="Pipeline's moving — nothing stuck." />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {data.preview.map((a) => (
            <li key={a.id} className="text-sm flex items-baseline gap-2">
              <span className="truncate flex-1">
                <span className="font-medium">{a.candidateName}</span>
                <span className="text-zinc-500"> · {a.jobTitle}</span>
              </span>
              <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 shrink-0">
                {a.stage.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-zinc-500 shrink-0">stuck {a.stuckDays}d</span>
            </li>
          ))}
        </ul>
      )}
      <CardViewAll />
    </Link>
  );
}
