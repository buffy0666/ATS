import Link from "next/link";
import { prisma } from "@/lib/prisma";

/**
 * Platform overview — counts that matter for running a SaaS.
 *
 * Intentionally lightweight; the full org list lives at /platform/organizations.
 */
export default async function PlatformOverview() {
  // Run the counts in parallel — they're independent and cheap.
  const [
    orgCount,
    userCount,
    candidateCount,
    jobCount,
    recentSignups,
    biggestOrgs,
  ] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count({ where: { active: true } }),
    prisma.candidate.count(),
    prisma.job.count(),
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: { select: { users: true, candidates: true } },
      },
    }),
    prisma.organization.findMany({
      orderBy: { candidates: { _count: "desc" } },
      take: 5,
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { candidates: true, users: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Organizations" value={orgCount} />
        <StatCard label="Active users" value={userCount} />
        <StatCard label="Candidates" value={candidateCount} />
        <StatCard label="Jobs" value={jobCount} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Panel title="Recent signups" subtitle="Latest 5 organizations created">
          {recentSignups.length === 0 ? (
            <EmptyState message="No organizations yet." />
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {recentSignups.map((o) => (
                <li key={o.id} className="py-2 flex items-center justify-between text-sm">
                  <Link
                    href={`/platform/organizations/${o.id}`}
                    className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
                  >
                    {o.name}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {o._count.users} {plural(o._count.users, "user", "users")} ·{" "}
                    {o._count.candidates} {plural(o._count.candidates, "candidate", "candidates")} ·{" "}
                    {o.createdAt.toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Biggest tenants" subtitle="By candidate count">
          {biggestOrgs.length === 0 ? (
            <EmptyState message="No data yet." />
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {biggestOrgs.map((o) => (
                <li key={o.id} className="py-2 flex items-center justify-between text-sm">
                  <Link
                    href={`/platform/organizations/${o.id}`}
                    className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
                  >
                    {o.name}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {o._count.candidates} {plural(o._count.candidates, "candidate", "candidates")}{" "}
                    · {o._count.users} {plural(o._count.users, "user", "users")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-zinc-500">{message}</p>;
}

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}
