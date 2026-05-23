import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EnrollmentStatus, StepRunStatus } from "@/generated/prisma";
import { EnrollmentControls } from "./EnrollmentControls";

const STATUS_BADGE: Record<EnrollmentStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  PAUSED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  COMPLETED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  CANCELED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export default async function SequenceEnrollmentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireSession();

  const sequence = await prisma.sequence.findUnique({
    where: { id },
    include: {
      _count: { select: { steps: true } },
      enrollments: {
        orderBy: { startedAt: "desc" },
        include: {
          candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
          stepRuns: {
            orderBy: { scheduledFor: "asc" },
            select: { id: true, status: true, scheduledFor: true },
          },
        },
      },
    },
  });

  if (!sequence) notFound();

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
      <Link href={`/sequences/${id}`} className="text-sm text-zinc-500 hover:underline">
        ← Back to sequence
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{sequence.name} — Enrollments</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {sequence.enrollments.length} enrollment{sequence.enrollments.length === 1 ? "" : "s"}{" "}
        · {sequence._count.steps} step{sequence._count.steps === 1 ? "" : "s"} per enrollment
      </p>

      {sequence.enrollments.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">No enrollments yet.</p>
      ) : (
        <div className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Candidate</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Progress</th>
                <th className="px-4 py-2 font-medium">Next step</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sequence.enrollments.map((e) => {
                const total = e.stepRuns.length;
                const completed = e.stepRuns.filter(
                  (r) => r.status === StepRunStatus.COMPLETED,
                ).length;
                const nextPending = e.stepRuns.find(
                  (r) => r.status === StepRunStatus.PENDING,
                );
                return (
                  <tr
                    key={e.id}
                    className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/candidates/${e.candidate.id}`}
                        className="font-medium hover:underline"
                      >
                        {e.candidate.firstName} {e.candidate.lastName}
                      </Link>
                      <div className="text-xs text-zinc-500">{e.candidate.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[e.status]}`}
                      >
                        {e.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {completed} / {total}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {nextPending ? describeNext(nextPending.scheduledFor) : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {e.startedAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <EnrollmentControls enrollmentId={e.id} status={e.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function describeNext(when: Date): string {
  const now = new Date();
  const ms = when.getTime() - now.getTime();
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (ms <= 0) return "due now";
  if (days === 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}
