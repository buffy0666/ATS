import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Stage } from "@/generated/prisma";
import { Pipeline } from "./Pipeline";
import { AddCandidateForm } from "./AddCandidateForm";
import { JobActions } from "./JobActions";

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
  const { orgId } = await requireSessionWithOrg();

  const job = await prisma.job.findFirst({
    where: { id, organizationId: orgId },
    include: {
      applications: {
        include: { candidate: true },
        orderBy: { createdAt: "desc" },
      },
      client: { select: { id: true, name: true } },
      hiringManagers: { orderBy: { createdAt: "asc" } },
      contracts: { orderBy: { uploadedAt: "asc" } },
    },
  });

  if (!job) notFound();

  const candidates = await prisma.candidate.findMany({
    where: { organizationId: orgId },
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
              {job.jobType && (
                <>
                  {" · "}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${jobTypeBadge(job.jobType)}`}
                  >
                    {job.jobType}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <JobActions
              jobId={job.id}
              jobTitle={job.title}
              applicantCount={job.applications.length}
            />
            <AddCandidateForm jobId={job.id} candidates={available} />
          </div>
        </div>

        <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Description
          </h2>
          <p className="whitespace-pre-wrap text-sm">{job.description}</p>
        </section>

        {job.hiringManagers.length > 0 && (
          <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
              Hiring managers
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {job.hiringManagers.map((m) => (
                <li
                  key={m.id}
                  className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 text-sm"
                >
                  <div className="font-medium">{m.name}</div>
                  <div className="mt-1 space-y-0.5 text-zinc-600 dark:text-zinc-400">
                    {m.email && (
                      <div>
                        <a href={`mailto:${m.email}`} className="hover:underline">
                          {m.email}
                        </a>
                      </div>
                    )}
                    {m.phone && (
                      <div>
                        <a href={`tel:${m.phone}`} className="hover:underline">
                          {m.phone}
                        </a>
                      </div>
                    )}
                    {m.chat && <div className="break-all">{m.chat}</div>}
                  </div>
                  {m.comments && (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-500">
                      {m.comments}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {job.hiringProcess && (
          <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">
              Hiring process
            </h2>
            <p className="whitespace-pre-wrap text-sm">{job.hiringProcess}</p>
          </section>
        )}

        {job.contracts.length > 0 && (
          <section className="mb-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
              Contracts ({job.contracts.length})
            </h2>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
              {job.contracts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {c.name}
                  </a>
                  <span className="shrink-0 text-xs text-zinc-500">{formatBytes(c.size)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Pipeline stages={STAGES} applications={job.applications} />
    </main>
  );
}

function jobTypeBadge(type: string): string {
  switch (type) {
    case "Urgent":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    case "Luxury":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200";
    default: // Normal
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
