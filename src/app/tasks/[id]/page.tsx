import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  addTaskAttachments,
  deleteTaskAttachment,
  updateTask,
} from "../actions";
import { TaskFormFields } from "../TaskFormFields";
import { DeleteTaskButton } from "./DeleteTaskButton";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireAdminWithOrg();
  const { id } = await params;

  const [task, assignableUsers] = await Promise.all([
    prisma.task.findFirst({
      where: { id, organizationId: orgId },
      include: {
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        attachments: { orderBy: { uploadedAt: "desc" } },
      },
    }),
    prisma.user.findMany({
      where: { active: true, organizationId: orgId },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  if (!task) notFound();

  const updateAction = updateTask.bind(null, task.id);
  const addAttachmentsAction = addTaskAttachments.bind(null, task.id);

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/tasks" className="text-sm text-zinc-500 hover:underline">
            ← All tasks
          </Link>
          <h1 className="text-2xl font-semibold mt-2">{task.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Created by {task.createdBy?.name ?? task.createdBy?.email ?? "—"} on{" "}
            {task.createdAt.toLocaleDateString()} · Updated{" "}
            {task.updatedAt.toLocaleDateString()}
          </p>
        </div>
        <DeleteTaskButton taskId={task.id} taskName={task.name} />
      </div>

      {task.description && (
        <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Description
          </h2>
          {/* Admin-only writers + readers — rendering stored HTML is the requested behavior. */}
          <div
            className="prose prose-sm max-w-none dark:prose-invert text-sm"
            dangerouslySetInnerHTML={{ __html: task.description }}
          />
        </section>
      )}

      <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-4">
          Edit
        </h2>
        <form action={updateAction} className="space-y-5">
          <TaskFormFields
            defaultName={task.name}
            defaultDescription={task.description ?? undefined}
            defaultStatus={task.status}
            defaultPriority={task.priority}
            defaultDueDate={task.dueDate}
            defaultAssignedToId={task.assignedToId}
            assignableUsers={assignableUsers}
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save changes
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-4">
          Attachments
        </h2>

        {task.attachments.length === 0 ? (
          <p className="text-sm text-zinc-500">No attachments yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 mb-4">
            {task.attachments.map((a) => {
              const deleteAction = deleteTaskAttachment.bind(null, a.id);
              return (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline truncate"
                    >
                      {a.name}
                    </a>
                    <p className="text-xs text-zinc-500">
                      {formatBytes(a.size)}
                      {a.mimeType ? ` · ${a.mimeType}` : ""} ·{" "}
                      {a.uploadedAt.toLocaleDateString()}
                    </p>
                  </div>
                  <form action={deleteAction}>
                    <button
                      type="submit"
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <form
          action={addAttachmentsAction}
          encType="multipart/form-data"
          className="flex items-center gap-3"
        >
          <input
            id="attachments"
            name="attachments"
            type="file"
            multiple
            required
            className="block flex-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Upload
          </button>
        </form>
      </section>
    </main>
  );
}
