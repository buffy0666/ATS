import Link from "next/link";
import { Prisma, TaskStatus } from "@/generated/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETE: "Complete",
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  NOT_STARTED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  IN_PROGRESS: "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  COMPLETE: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
};

const SORT_COLUMNS = ["name", "status", "updatedAt", "createdAt"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

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
  await requireAdmin();
  const { status: statusRaw, sort: sortRaw, dir: dirRaw } = await searchParams;

  const status = parseStatus(statusRaw);
  const sort = parseSort(sortRaw);
  const dir = parseDir(dirRaw);

  const where: Prisma.TaskWhereInput = status ? { status } : {};
  const tasks = await prisma.task.findMany({
    where,
    orderBy: { [sort]: dir },
    include: {
      createdBy: { select: { name: true, email: true } },
      _count: { select: { attachments: true } },
    },
  });

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

      <StatusFilter current={status} sort={sort} dir={dir} />

      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500 mt-6">No tasks{status ? ` with status "${STATUS_LABEL[status]}"` : ""}.</p>
      ) : (
        <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <SortHeader column="name" label="Name" sort={sort} dir={dir} status={status} />
                <SortHeader column="status" label="Status" sort={sort} dir={dir} status={status} />
                <th className="px-4 py-2 font-medium">Files</th>
                <SortHeader
                  column="updatedAt"
                  label="Updated"
                  sort={sort}
                  dir={dir}
                  status={status}
                />
                <SortHeader
                  column="createdAt"
                  label="Created"
                  sort={sort}
                  dir={dir}
                  status={status}
                />
                <th className="px-4 py-2 font-medium">Created by</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                >
                  <td className="px-4 py-3">
                    <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[t.status]}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-600 dark:text-zinc-400">
                    {t._count.attachments}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {t.updatedAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {t.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {t.createdBy?.name ?? t.createdBy?.email ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function buildHref(params: { status: TaskStatus | null; sort: SortColumn; dir: "asc" | "desc" }) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.sort !== "updatedAt") q.set("sort", params.sort);
  if (params.dir !== "desc") q.set("dir", params.dir);
  const qs = q.toString();
  return qs ? `/tasks?${qs}` : "/tasks";
}

function StatusFilter({
  current,
  sort,
  dir,
}: {
  current: TaskStatus | null;
  sort: SortColumn;
  dir: "asc" | "desc";
}) {
  const options: { label: string; value: TaskStatus | null }[] = [
    { label: "All", value: null },
    { label: "Not started", value: TaskStatus.NOT_STARTED },
    { label: "In progress", value: TaskStatus.IN_PROGRESS },
    { label: "Complete", value: TaskStatus.COMPLETE },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-zinc-500">Filter</span>
      {options.map((opt) => {
        const isActive = current === opt.value;
        return (
          <Link
            key={opt.label}
            href={buildHref({ status: opt.value, sort, dir })}
            className={`rounded-full border px-3 py-1 text-xs ${
              isActive
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

function SortHeader({
  column,
  label,
  sort,
  dir,
  status,
}: {
  column: SortColumn;
  label: string;
  sort: SortColumn;
  dir: "asc" | "desc";
  status: TaskStatus | null;
}) {
  const isActive = sort === column;
  const nextDir: "asc" | "desc" = isActive && dir === "desc" ? "asc" : "desc";
  const arrow = isActive ? (dir === "desc" ? " ↓" : " ↑") : "";
  return (
    <th className="px-4 py-2 font-medium">
      <Link
        href={buildHref({ status, sort: column, dir: nextDir })}
        className="hover:text-zinc-900 dark:hover:text-white"
      >
        {label}
        {arrow}
      </Link>
    </th>
  );
}
