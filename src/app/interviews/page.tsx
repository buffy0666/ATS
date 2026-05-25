import Link from "next/link";
import { InterviewStatus, type Prisma } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { getOrCreateICalToken } from "@/lib/ical-token";
import { prisma } from "@/lib/prisma";
import { SubscribeBlock } from "./SubscribeBlock";

type FilterMode = "mine" | "all";

const STATUS_BADGE: Record<InterviewStatus, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  CANCELED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  NO_SHOW: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  RESCHEDULED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { session, orgId } = await requireSessionWithOrg();
  const sp = await searchParams;

  const filter: FilterMode = sp.filter === "all" ? "all" : "mine";

  // Every interview query is org-scoped; the "mine" filter further narrows
  // to interviews the current user is organizer or attendee on.
  const mineClause: Prisma.InterviewWhereInput =
    filter === "mine"
      ? {
          organizationId: orgId,
          OR: [
            { organizerId: session.user.id },
            { attendees: { some: { userId: session.user.id } } },
          ],
        }
      : { organizationId: orgId };

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const baseInclude = {
    candidate: { select: { id: true, firstName: true, lastName: true } },
    application: {
      select: {
        id: true,
        job: { select: { id: true, title: true } },
      },
    },
    _count: { select: { attendees: true } },
  } satisfies Prisma.InterviewInclude;

  const [today, upcoming, past, token] = await Promise.all([
    prisma.interview.findMany({
      where: {
        ...mineClause,
        startAt: { gte: startOfToday, lt: startOfTomorrow },
      },
      orderBy: { startAt: "asc" },
      include: baseInclude,
    }),
    prisma.interview.findMany({
      where: { ...mineClause, startAt: { gte: startOfTomorrow } },
      orderBy: { startAt: "asc" },
      include: baseInclude,
      take: 200,
    }),
    prisma.interview.findMany({
      where: { ...mineClause, startAt: { lt: startOfToday } },
      orderBy: { startAt: "desc" },
      include: baseInclude,
      take: 100,
    }),
    getOrCreateICalToken(session.user.id),
  ]);

  const appBaseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const subscribeUrl = `${appBaseUrl}/api/calendar/${token}`;

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Interviews</h1>
        <div className="flex items-center gap-2">
          <FilterToggle current={filter} />
          <SubscribeBlock url={subscribeUrl} />
          <Link
            href="/interviews/new"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            + New interview
          </Link>
        </div>
      </div>

      <Section title="Today" rows={today} emptyMessage="Nothing on the calendar for today." />
      <Section
        title="Upcoming"
        rows={upcoming}
        emptyMessage={
          filter === "mine"
            ? "No upcoming interviews on your calendar."
            : "No upcoming interviews."
        }
      />
      <Section title="Past" rows={past} emptyMessage="No past interviews." />
    </main>
  );
}

function FilterToggle({ current }: { current: FilterMode }) {
  const link = (mode: FilterMode, label: string) => {
    const isActive = current === mode;
    const href = mode === "mine" ? "/interviews" : "/interviews?filter=all";
    return (
      <Link
        href={href}
        className={`rounded-md px-3 py-2 text-sm border ${
          isActive
            ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
            : "border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        }`}
      >
        {label}
      </Link>
    );
  };
  return (
    <div className="flex items-center gap-1">
      {link("mine", "Mine")}
      {link("all", "All")}
    </div>
  );
}

type InterviewRow = Awaited<ReturnType<typeof prisma.interview.findMany>>[number] & {
  candidate: { id: string; firstName: string; lastName: string };
  application: { id: string; job: { id: string; title: string } } | null;
  _count: { attendees: number };
};

function Section({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: InterviewRow[];
  emptyMessage: string;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Candidate</th>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Attendees</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((iv) => (
                <tr
                  key={iv.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    {formatRange(iv.startAt, iv.endAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/interviews/${iv.id}`} className="font-medium hover:underline">
                      {iv.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/candidates/${iv.candidate.id}`}
                      className="hover:underline text-zinc-700 dark:text-zinc-300"
                    >
                      {iv.candidate.firstName} {iv.candidate.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {iv.application ? (
                      <Link
                        href={`/jobs/${iv.application.job.id}`}
                        className="hover:underline"
                      >
                        {iv.application.job.title}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[iv.status]}`}
                    >
                      {iv.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right text-zinc-600 dark:text-zinc-400">
                    {iv._count.attendees}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatRange(start: Date, end: Date): string {
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, dateFmt)} · ${start.toLocaleTimeString(undefined, timeFmt)} – ${end.toLocaleTimeString(undefined, timeFmt)}`;
  }
  return `${start.toLocaleDateString(undefined, dateFmt)} ${start.toLocaleTimeString(undefined, timeFmt)} → ${end.toLocaleDateString(undefined, dateFmt)} ${end.toLocaleTimeString(undefined, timeFmt)}`;
}
