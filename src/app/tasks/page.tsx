import Link from "next/link";
import {
  EnrollmentStatus,
  Prisma,
  TaskKind,
  TaskStatus,
} from "@/generated/prisma";
import { isAdminOrAbove, requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { taskVisibilityWhere } from "./access";
import { SORT_COLUMNS, type SortColumn } from "./sort";
import { type TaskRow as ListRow, TasksTable } from "./TasksTable";
import { TaskBoard, type BoardGroups, type BoardTask } from "./TaskBoard";

function parseSort(raw: string | undefined): SortColumn {
  return (SORT_COLUMNS as readonly string[]).includes(raw ?? "")
    ? (raw as SortColumn)
    : "updatedAt";
}
function parseDir(raw: string | undefined): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}
function parseStatus(raw: string | undefined): TaskStatus | null {
  if (raw && Object.values(TaskStatus).includes(raw as TaskStatus)) return raw as TaskStatus;
  return null;
}
function parseKind(raw: string | undefined): TaskKind | null {
  if (raw && Object.values(TaskKind).includes(raw as TaskKind)) return raw as TaskKind;
  return null;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type SearchParams = {
  view?: string;
  scope?: string;
  kind?: string;
  status?: string;
  sort?: string;
  dir?: string;
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { session, orgId } = await requireSessionWithOrg();
  const sp = await searchParams;
  const isAdmin = isAdminOrAbove(session.user.role);
  const userId = session.user.id ?? "";
  const view = sp.view === "list" ? "list" : "board";

  const assignableUsers = await prisma.user.findMany({
    where: { active: true, organizationId: orgId },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  });

  // ---- Classic list view (sortable, bulk edit) ----
  if (view === "list") {
    const status = parseStatus(sp.status);
    const sort = parseSort(sp.sort);
    const dir = parseDir(sp.dir);
    const where: Prisma.TaskWhereInput = {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...taskVisibilityWhere(session.user.role, userId),
    };
    const tasks = await prisma.task.findMany({
      where,
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
    });
    const rows: ListRow[] = tasks.map((t) => ({
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
        <Header isAdmin={isAdmin} view="list" />
        <TasksTable tasks={rows} assignableUsers={assignableUsers} status={status} sort={sort} dir={dir} />
      </main>
    );
  }

  // ---- Board view (grouped by due date) ----
  const scope = sp.scope === "all" && isAdmin ? "all" : "me";
  const kind = parseKind(sp.kind);

  const where: Prisma.TaskWhereInput = {
    organizationId: orgId,
    ...(scope === "me" ? { assignedToId: userId } : {}),
    ...(kind ? { kind } : {}),
    AND: [
      taskVisibilityWhere(session.user.role, userId),
      // Hide PENDING sequence tasks whose enrollment isn't active (paused via
      // reply/bounce, canceled, or completed). Completed tasks always show so
      // they land in the Completed group; plain tasks are always eligible.
      {
        OR: [
          { stepRunId: null },
          { status: TaskStatus.COMPLETE },
          { stepRun: { enrollment: { status: EnrollmentStatus.ACTIVE } } },
        ],
      },
    ],
  };

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [
      { dueDate: { sort: "asc", nulls: "last" } },
      { priority: { sort: "desc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      candidate: { select: { id: true, firstName: true, lastName: true } },
      stepRun: {
        select: { enrollment: { select: { sequence: { select: { id: true, name: true } } } } },
      },
      _count: { select: { attachments: true } },
    },
  });

  const todayStart = startOfToday();
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const groups: BoardGroups = { overdue: [], today: [], upcoming: [], noDate: [], completed: [] };
  for (const t of tasks) {
    const row: BoardTask = {
      id: t.id,
      name: t.name,
      kind: t.kind,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      assignee: t.assignedTo ? t.assignedTo.name ?? t.assignedTo.email : null,
      candidate: t.candidate
        ? {
            id: t.candidate.id,
            name: [t.candidate.firstName, t.candidate.lastName].filter(Boolean).join(" ") || "Candidate",
          }
        : null,
      sequence: t.stepRun?.enrollment.sequence
        ? { id: t.stepRun.enrollment.sequence.id, name: t.stepRun.enrollment.sequence.name }
        : null,
      isSequenceTask: !!t.stepRun,
      attachmentCount: t._count.attachments,
    };
    if (t.status === TaskStatus.COMPLETE) groups.completed.push(row);
    else if (!t.dueDate) groups.noDate.push(row);
    else if (t.dueDate < todayStart) groups.overdue.push(row);
    else if (t.dueDate < tomorrowStart) groups.today.push(row);
    else groups.upcoming.push(row);
  }
  // Completed: most-recent first, capped.
  groups.completed.reverse();
  groups.completed = groups.completed.slice(0, 50);

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
      <Header isAdmin={isAdmin} view="board" />
      <TaskBoard groups={groups} scope={scope} isAdmin={isAdmin} kind={kind} />
    </main>
  );
}

function Header({ isAdmin, view }: { isAdmin: boolean; view: "board" | "list" }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {isAdmin ? "Across the workspace." : "Assigned to or created by you."} Calls, emails,
          and sequence steps land here.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="rounded-md border border-zinc-300 dark:border-zinc-700 text-xs overflow-hidden flex">
          <Link
            href="/tasks"
            className={`px-3 py-1.5 ${view === "board" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            Board
          </Link>
          <Link
            href="/tasks?view=list"
            className={`px-3 py-1.5 ${view === "list" ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
          >
            List
          </Link>
        </div>
        <Link
          href="/tasks/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          New task
        </Link>
      </div>
    </div>
  );
}
