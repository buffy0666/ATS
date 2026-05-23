import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { InterviewStatus, Prisma } from "@/generated/prisma";
import { CardEmpty, CardHeader, CardViewAll } from "./CardChrome";
import { formatTimeHM, shimmerCardClass, todayBounds } from "./_helpers";

type InterviewItem = {
  id: string;
  startAt: Date;
  title: string;
  candidateName: string;
  candidateId: string;
  videoUrl: string | null;
  location: string | null;
};

export type InterviewsTodayData = {
  count: number;
  preview: InterviewItem[];
};

export async function loadInterviewsToday(userId: string): Promise<InterviewsTodayData> {
  const { start, endInclusive } = todayBounds();

  const baseWhere: Prisma.InterviewWhereInput = {
    startAt: { gte: start, lte: endInclusive },
    status: InterviewStatus.SCHEDULED,
    OR: [
      { organizerId: userId },
      { attendees: { some: { userId } } },
    ],
  };

  const [interviews, count] = await Promise.all([
    prisma.interview.findMany({
      where: baseWhere,
      orderBy: { startAt: "asc" },
      take: 5,
      select: {
        id: true,
        startAt: true,
        title: true,
        videoUrl: true,
        location: true,
        candidate: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.interview.count({ where: baseWhere }),
  ]);

  return {
    count,
    preview: interviews.map((i) => ({
      id: i.id,
      startAt: i.startAt,
      title: i.title,
      candidateName: `${i.candidate.firstName} ${i.candidate.lastName}`,
      candidateId: i.candidate.id,
      videoUrl: i.videoUrl,
      location: i.location,
    })),
  };
}

export function InterviewsTodayCard({ data }: { data: InterviewsTodayData }) {
  return (
    <Link href="/interviews" className={shimmerCardClass(data.count)}>
      <CardHeader label="Interviews today" count={data.count} />
      {data.count === 0 ? (
        <CardEmpty text="Nothing on the calendar today." />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {data.preview.map((iv) => (
            <li key={iv.id} className="text-sm flex items-baseline gap-2">
              <span className="font-medium tabular-nums shrink-0">
                {formatTimeHM(iv.startAt)}
              </span>
              <span className="truncate flex-1">
                {iv.title}
                <span className="text-zinc-500"> · {iv.candidateName}</span>
              </span>
              <span className="text-xs text-zinc-500 shrink-0">
                {iv.videoUrl ? "Join" : iv.location ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <CardViewAll />
    </Link>
  );
}
