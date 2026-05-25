import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EnrollmentStatus, SequenceStatus } from "@/generated/prisma";

const STATUS_BADGE: Record<SequenceStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  ARCHIVED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default async function SequencesPage() {
  const { orgId } = await requireSessionWithOrg();
  const sequences = await prisma.sequence.findMany({
    where: { organizationId: orgId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { steps: true } },
      createdBy: { select: { name: true, email: true } },
      enrollments: {
        where: { status: EnrollmentStatus.ACTIVE },
        select: { id: true },
      },
    },
  });

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Sequences</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Multi-step cadences — emails go out automatically, calls/texts/LinkedIn show up
            on your Tasks Due list.
          </p>
        </div>
        <Link
          href="/sequences/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          New sequence
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link
          href="/sequences/tasks"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Tasks due →
        </Link>
      </div>

      {sequences.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No sequences yet. Create one to schedule a series of touchpoints across many
          candidates at once.
        </p>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Steps</th>
                <th className="px-4 py-2 font-medium text-right">Active enrollments</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                >
                  <td className="px-4 py-3">
                    <Link href={`/sequences/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    {s.description && (
                      <div className="text-xs text-zinc-500 line-clamp-1">{s.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[s.status]}`}
                    >
                      {s.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s._count.steps}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.enrollments.length}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {s.createdBy ? s.createdBy.name ?? s.createdBy.email : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {s.updatedAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
