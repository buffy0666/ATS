import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Stage } from "@/generated/prisma";
import { Pipeline } from "./Pipeline";
import { AddCandidateForm } from "./AddCandidateForm";

const STAGES: Stage[] = [
  Stage.APPLIED,
  Stage.SCREEN,
  Stage.INTERVIEW,
  Stage.OFFER,
  Stage.HIRED,
  Stage.REJECTED,
];

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      applications: {
        include: { candidate: true },
        orderBy: { createdAt: "desc" },
      },
      client: { select: { id: true, name: true } },
    },
  });

  if (!job) notFound();

  const candidates = await prisma.candidate.findMany({
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const linkedIds = new Set(job.applications.map((a) => a.candidateId));
  const available = candidates.filter((c) => !linkedIds.has(c.id));

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <Link href="/jobs" className="text-sm text-zinc-500 hover:underline">
              ← All jobs
            </Link>
            <h1 className="text-2xl font-semibold mt-1">{job.title}</h1>
            {job.client && (
              <p className="text-sm text-zinc-500 mt-1">
                <Link href={`/clients/${job.client.id}`} className="hover:underline">
                  {job.client.name}
                </Link>
              </p>
            )}
            <p className="text-sm text-zinc-500 mt-1">
              {[job.department, job.location].filter(Boolean).join(" · ") || "—"} ·{" "}
              <span className="uppercase tracking-wide">{job.status}</span>
            </p>
          </div>
          <AddCandidateForm jobId={job.id} candidates={available} />
        </div>

        <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Description
          </h2>
          <p className="whitespace-pre-wrap text-sm">{job.description}</p>
        </section>

        <Pipeline stages={STAGES} applications={job.applications} />
    </main>
  );
}
