import Link from "next/link";
import { InterviewStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { formatTimeHM, relativeTime } from "./_helpers";

/**
 * Top-of-page hero: time-of-day greeting + a one-line "what's next" hook.
 *
 * "What's next" is the soonest upcoming SCHEDULED interview where the user
 * is either the organizer or an attendee. Falls back to a friendly empty
 * state when nothing is on the calendar.
 */

type NextInterview = {
  id: string;
  title: string;
  startAt: Date;
  candidate: { firstName: string; lastName: string };
  application: { job: { title: string; client: { name: string } | null } | null } | null;
};

export type GreetingData = {
  firstName: string | null;
  next: NextInterview | null;
};

export async function loadGreeting(userId: string, orgId: string): Promise<GreetingData> {
  const [user, next] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
    prisma.interview.findFirst({
      where: {
        organizationId: orgId,
        status: InterviewStatus.SCHEDULED,
        startAt: { gte: new Date() },
        OR: [
          { organizerId: userId },
          { attendees: { some: { userId } } },
        ],
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        title: true,
        startAt: true,
        candidate: { select: { firstName: true, lastName: true } },
        application: {
          select: {
            job: {
              select: {
                title: true,
                client: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? null;
  return { firstName, next };
}

function timeOfDayGreeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Working late";
}

export function Greeting({ data }: { data: GreetingData }) {
  const tod = timeOfDayGreeting();
  const headline = data.firstName ? `${tod}, ${data.firstName}.` : `${tod}.`;

  return (
    <section
      className="
        relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800
        bg-gradient-to-br from-white via-white to-indigo-50/40
        dark:from-zinc-900 dark:via-zinc-900 dark:to-indigo-950/30
        px-6 py-5
        shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_10px_-6px_rgba(0,0,0,0.08)]
        dark:shadow-[0_1px_2px_rgba(0,0,0,0.5),0_4px_12px_-6px_rgba(0,0,0,0.6)]
      "
    >
      {/* Decorative gradient blob in the corner — adds warmth without
          carrying any information. Hidden on small screens to keep the
          text the focus. */}
      <div
        aria-hidden="true"
        className="
          hidden sm:block pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full
          bg-gradient-to-br from-indigo-200/40 via-violet-200/30 to-transparent
          dark:from-indigo-500/15 dark:via-violet-500/10 dark:to-transparent
          blur-2xl
        "
      />
      <div className="relative flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{headline}</h1>
          <NextLine next={data.next} />
        </div>
      </div>
    </section>
  );
}

function NextLine({ next }: { next: NextInterview | null }) {
  if (!next) {
    return (
      <p className="mt-1 text-sm text-zinc-500">
        Nothing on your calendar right now. <Link href="/interviews/new" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">Schedule something</Link>?
      </p>
    );
  }

  const candidate = `${next.candidate.firstName} ${next.candidate.lastName}`;
  const job = next.application?.job;
  const jobLine = job
    ? job.client
      ? `${job.title} at ${job.client.name}`
      : job.title
    : null;

  return (
    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
      Next up:{" "}
      <Link href={`/interviews/${next.id}`} className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline">
        {formatTimeHM(next.startAt)} with {candidate}
      </Link>
      {jobLine && <span className="text-zinc-500"> — {jobLine}</span>}
      <span className="text-zinc-400"> · {relativeTime(next.startAt)}</span>
    </p>
  );
}
