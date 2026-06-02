import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ListScope } from "@/generated/prisma";
import { EntityMultiSelect } from "@/components/EntityMultiSelect";
import { createList } from "../actions";

export default async function NewListPage() {
  const { orgId } = await requireSessionWithOrg();

  const [jobs, users] = await Promise.all([
    prisma.job.findMany({
      where: { organizationId: orgId },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
      take: 500,
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, active: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const jobOptions = jobs.map((j) => ({ id: j.id, label: j.title }));
  const userOptions = users.map((u) => ({ id: u.id, label: u.name ?? u.email }));

  return (
    <main className="flex-1 max-w-xl mx-auto w-full px-6 py-10">
      <Link href="/lists" className="text-sm text-zinc-500 hover:underline">
        ← All lists
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">New list</h1>

      <form
        action={createList}
        className="mt-6 space-y-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            placeholder="e.g. Active Engineering"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="What this list is for (optional)…"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Jobs</label>
          <EntityMultiSelect
            name="jobIds"
            options={jobOptions}
            placeholder="Link this list to job(s)…"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Assigned to</label>
          <EntityMultiSelect
            name="assigneeIds"
            options={userOptions}
            placeholder="Assign teammate(s)…"
          />
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium">Visibility</legend>
          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="scope"
                value={ListScope.PERSONAL}
                defaultChecked
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Personal</span>{" "}
                <span className="text-zinc-500">— only you can see and edit this list.</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="scope" value={ListScope.SHARED} className="mt-0.5" />
              <span>
                <span className="font-medium">Shared</span>{" "}
                <span className="text-zinc-500">
                  — everyone on the team can see and add to it. Only you can rename or delete it.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
        >
          Create list
        </button>
      </form>
    </main>
  );
}
