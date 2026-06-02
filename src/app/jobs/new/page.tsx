import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createJob } from "../actions";
import { SalaryFeeFields } from "../SalaryFeeFields";
import { JobExtraFields } from "../JobExtraFields";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId: preselectedClientId } = await searchParams;
  const { orgId } = await requireSessionWithOrg();
  const clients = await prisma.client.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">New job</h1>
      <form action={createJob} className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <Field label="Title" name="title" required />
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="clientId">
            Client
          </label>
          {clients.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No clients yet —{" "}
              <Link href="/clients/new" className="underline">
                create one
              </Link>{" "}
              first if this job belongs to a company.
            </p>
          ) : (
            <select
              id="clientId"
              name="clientId"
              defaultValue={preselectedClientId ?? ""}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="">— No client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Department" name="department" />
          <Field label="Location" name="location" />
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
            defaultValue="OPEN"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="OPEN">Open</option>
            <option value="DRAFT">Draft</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <SalaryFeeFields />
        <JobExtraFields />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
        >
          Create job
        </button>
      </form>
    </main>
  );
}

function Field({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        required={required}
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
      />
    </div>
  );
}
