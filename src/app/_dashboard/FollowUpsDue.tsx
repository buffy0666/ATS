import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CandidateStatus, Prisma } from "@/generated/prisma";
import { CardEmpty, CardHeader, CardViewAll } from "./CardChrome";
import { daysAgo, daysBetween, shimmerCardClass } from "./_helpers";

type FollowUpItem = {
  id: string;
  name: string;
  reason: string;
};

export type FollowUpsDueData = {
  count: number;
  preview: FollowUpItem[];
};

export async function loadFollowUpsDue(): Promise<FollowUpsDueData> {
  const now = new Date();
  const cutoff = daysAgo(30, now);

  const where: Prisma.CandidateWhereInput = {
    status: CandidateStatus.ACTIVE,
    OR: [
      { nextFollowUpAt: { lte: now } },
      {
        AND: [
          { OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: cutoff } }] },
        ],
      },
    ],
  };

  const [candidates, count] = await Promise.all([
    prisma.candidate.findMany({
      where,
      orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { lastContactedAt: "asc" }],
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        lastContactedAt: true,
        nextFollowUpAt: true,
      },
    }),
    prisma.candidate.count({ where }),
  ]);

  const preview: FollowUpItem[] = candidates.map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName}`,
    reason: describeReason(c.nextFollowUpAt, c.lastContactedAt, now),
  }));

  return { count, preview };
}

function describeReason(
  nextFollowUpAt: Date | null,
  lastContactedAt: Date | null,
  now: Date,
): string {
  if (nextFollowUpAt && nextFollowUpAt <= now) {
    const days = daysBetween(nextFollowUpAt, now);
    if (days <= 0) return "Follow-up due today";
    return `Follow-up was ${days}d ago`;
  }
  if (!lastContactedAt) return "Never contacted";
  const days = daysBetween(lastContactedAt, now);
  return `Last contacted ${days}d ago`;
}

export function FollowUpsDueCard({ data }: { data: FollowUpsDueData }) {
  return (
    <Link
      href="/candidates?lastContactedDays=30"
      className={shimmerCardClass(data.count)}
    >
      <CardHeader label="Follow-ups due" count={data.count} />
      {data.count === 0 ? (
        <CardEmpty text="Everyone's been recently contacted." />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {data.preview.map((c) => (
            <li key={c.id} className="text-sm flex items-baseline gap-2">
              <span className="truncate flex-1 font-medium">{c.name}</span>
              <span className="text-xs text-zinc-500 shrink-0">{c.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <CardViewAll />
    </Link>
  );
}
