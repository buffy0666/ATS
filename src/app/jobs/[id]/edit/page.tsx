import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { updateJob } from "../../actions";
import { SalaryFeeFields } from "../../SalaryFeeFields";
import { JobExtraFields } from "../../JobExtraFields";

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId } = await requireSessionWithOrg();

  const [job, clients] = await Promise.all([
    prisma.job.findFirst({
      where: { id, organizationId: orgId },
      include: {
        hiringManagers: { orderBy: { createdAt: "asc" } },
        contracts: { orderBy: { uploadedAt: "asc" } },
      },
    }),
    prisma.client.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!job) notFound();

  const update = updateJob.bind(null, job.id);

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
      <Link href={`/jobs/${job.id}`} className="text-sm text-zinc-500 hover:underline">
        ← Back to job
      </Link>
      <h1 className="text-2xl font-semibold mt-1 mb-6">Edit job</h1>
      <form action={update} className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <Field label="Title" name="title" required defaultValue={job.title} />
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="clientId">
            Client
          </label>
          <select
            id="clientId"
            name="clientId"
            defaultValue={job.clientId ?? ""}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">— No client —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Department" name="department" defaultValue={job.department ?? ""} />
          <Field label="Location" name="location" defaultValue={job.location ?? ""} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={6}
            defaultValue={job.description}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={job.status}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="OPEN">Open</option>
            <option value="DRAFT">Draft</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <SalaryFeeFields
          defaultLow={job.salaryLow}
          defaultHigh={job.salaryHigh}
          defaultPercent={job.placementFeePercent}
        />
        <JobExtraFields
          jobId={job.id}
          defaultHiringProcess={job.hiringProcess}
          defaultJobType={job.jobType}
          defaultManagers={job.hiringManagers.map((m) => ({
            name: m.name,
            email: m.email ?? "",
            phone: m.phone ?? "",
            chat: m.chat ?? "",
            comments: m.comments ?? "",
          }))}
          existingContracts={job.contracts.map((c) => ({
            id: c.id,
            name: c.name,
            url: c.url,
            size: c.size,
          }))}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
          >
            Save changes
          </button>
          <Link
            href={`/jobs/${job.id}`}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
      />
    </div>
  );
}
