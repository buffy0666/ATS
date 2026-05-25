import Link from "next/link";
import { Prisma, TaskStatus } from "@/generated/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { SORT_COLUMNS, type SortColumn } from "./sort";
import { type TaskRow, TasksTable } from "./TasksTable";

function parseSort(raw: string | undefined): SortColumn {
  return (SORT_COLUMNS as readonly string[]).includes(raw ?? "")
    ? (raw as SortColumn)
    : "updatedAt";
}

function parseDir(raw: string | undefined): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

function parseStatus(raw: string | undefined): TaskStatus | null {
  if (!raw) return null;
  if (Object.values(TaskStatus).includes(raw as TaskStatus)) return raw as TaskStatus;
  return null;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string; dir?: string }>;
}) {
  const { orgId } = await requireAdminWithOrg();
  const { status: statusRaw, sort: sortRaw, dir: dirRaw } = await searchParams;

  const status = parseStatus(statusRaw);
  const sort = parseSort(sortRaw);
  const dir = parseDir(dirRaw);

  const where: Prisma.TaskWhereInput = {
    organizationId: orgId,
    ...(status ? { status } : {}),
  };

  const [tasks, assignableUsers] = await Promise.all([
    prisma.task.findMany({
      where,
      // For dueDate / priority we push nulls to the end so unset rows don't
      // dominate the top of ascending sorts.
      orderBy:
        sort === "dueDate"
          ? [{ dueDate: { sort: dir, nulls: "last" } }, { updatedAt: "desc" }]
          : sort === "priority"
            ? [{ priority: { sort: dir, nulls: "last" } }, { updatedAt: "desc" }]
            : { [sort]: dir },
      include: {
        createdBy: { select: { name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        _count: { select: { attachments: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true, organizationId: orgId },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    attachmentCount: t._count.attachments,
    updatedAt: t.updatedAt,
    createdAt: t.createdAt,
    createdBy: t.createdBy,
    assignedTo: t.assignedTo,
  }));

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-zinc-500 mt-1">Shared admin task list.</p>
        </div>
        <Link
          href="/tasks/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          New task
        </Link>
      </div>

      <TasksTable
        tasks={rows}
        assignableUsers={assignableUsers}
        status={status}
        sort={sort}
        dir={dir}
      />
    </main>
  );
}
