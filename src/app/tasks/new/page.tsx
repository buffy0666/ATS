import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createTask } from "../actions";
import { TaskFormFields } from "../TaskFormFields";

export default async function NewTaskPage() {
  const { orgId } = await requireSessionWithOrg();

  const assignableUsers = await prisma.user.findMany({
    where: { active: true, organizationId: orgId },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  });

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <Link href="/tasks" className="text-sm text-zinc-500 hover:underline">
        ← All tasks
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-6">New task</h1>

      <form
        action={createTask}
        encType="multipart/form-data"
        className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <TaskFormFields assignableUsers={assignableUsers} />

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="attachments">
            Attachments
          </label>
          <input
            id="attachments"
            name="attachments"
            type="file"
            multiple
            className="block w-full text-sm"
          />
          <p className="mt-1 text-xs text-zinc-500">Up to 25 MB each. Any file type.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Create task
          </button>
          <Link
            href="/tasks"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
