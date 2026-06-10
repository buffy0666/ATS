import Link from "next/link";
import { Stage } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { formatSalaryRange } from "./job-money";
import { JobsView, type JobRow } from "./JobsView";

const IN_PROCESS_STAGES: Stage[] = [Stage.APPLIED, Stage.SCREEN, Stage.INTERVIEW, Stage.OFFER];

export default async function JobsPage() {
  const { orgId } = await requireSessionWithOrg();
  const jobs = await prisma.job.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true } },
      applications: { select: { stage: true } },
      hiringManagers: { select: { name: true } },
    },
  });

  const rows: JobRow[] = jobs.map((j) => {
    const inProcess = j.applications.filter((a) =>
      IN_PROCESS_STAGES.includes(a.stage),
    ).length;
    const finalInterview = j.applications.filter((a) => a.stage === Stage.INTERVIEW).length;
    return {
      id: j.id,
      title: j.title,
      department: j.department,
      location: j.location,
      status: j.status,
      jobType: j.jobType,
      createdAt: j.createdAt.toISOString(),
      client: j.client,
      hiringManagers: j.hiringManagers.map((m) => m.name),
      salaryRange: formatSalaryRange(j.salaryLow, j.salaryHigh),
      inProcess,
      finalInterview,
    };
  });

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <Link
          href="/jobs/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          New job
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No jobs yet. Create the first one.</p>
      ) : (
        <JobsView jobs={rows} />
      )}
    </main>
  );
}
