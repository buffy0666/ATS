import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  EnrollmentStatus,
  SequenceStepType,
  StepRunStatus,
  TaskStatus,
} from "@/generated/prisma";
import { CardEmpty, CardHeader, CardViewAll } from "./CardChrome";
import { dueLabel, shimmerCardClass, todayBounds } from "./_helpers";

type TaskItem = {
  key: string;
  title: string;
  candidateName: string | null;
  candidateId: string | null;
  dueAt: Date | null;
  badge: string;
};

export type TasksDueData = {
  count: number;
  preview: TaskItem[];
};

export async function loadTasksDue(userId: string, orgId: string): Promise<TasksDueData> {
  const { endInclusive } = todayBounds();

  const [openTasks, stepRunsDue, stepRunCount] = await Promise.all([
    prisma.task.findMany({
      where: {
        organizationId: orgId,
        createdById: userId,
        status: { not: TaskStatus.COMPLETE },
      },
      orderBy: { updatedAt: "asc" },
      take: 5,
      select: { id: true, name: true, status: true, updatedAt: true },
    }),
    prisma.stepRun.findMany({
      where: {
        status: StepRunStatus.PENDING,
        scheduledFor: { lte: endInclusive },
        step: { type: { not: SequenceStepType.EMAIL } },
        enrollment: {
          enrolledById: userId,
          status: EnrollmentStatus.ACTIVE,
          sequence: { organizationId: orgId },
        },
      },
      orderBy: { scheduledFor: "asc" },
      take: 5,
      include: {
        step: { select: { type: true, taskTitle: true } },
        enrollment: {
          select: {
            candidate: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.stepRun.count({
      where: {
        status: StepRunStatus.PENDING,
        scheduledFor: { lte: endInclusive },
        step: { type: { not: SequenceStepType.EMAIL } },
        enrollment: {
          enrolledById: userId,
          status: EnrollmentStatus.ACTIVE,
          sequence: { organizationId: orgId },
        },
      },
    }),
  ]);

  const taskCount = await prisma.task.count({
    where: {
      organizationId: orgId,
      createdById: userId,
      status: { not: TaskStatus.COMPLETE },
    },
  });

  const stepItems: TaskItem[] = stepRunsDue.map((r) => ({
    key: `step-${r.id}`,
    title: r.step.taskTitle ?? "(untitled task)",
    candidateName: `${r.enrollment.candidate.firstName} ${r.enrollment.candidate.lastName}`,
    candidateId: r.enrollment.candidate.id,
    dueAt: r.scheduledFor,
    badge: r.step.type.toLowerCase(),
  }));

  const taskItems: TaskItem[] = openTasks.map((t) => ({
    key: `task-${t.id}`,
    title: t.name,
    candidateName: null,
    candidateId: null,
    dueAt: null,
    badge: t.status === TaskStatus.IN_PROGRESS ? "in progress" : "task",
  }));

  // Step runs first (they're time-bound), then standalone tasks.
  const preview = [...stepItems, ...taskItems].slice(0, 5);
  const count = taskCount + stepRunCount;

  return { count, preview };
}

export function TasksDueCard({ data }: { data: TasksDueData }) {
  return (
    <Link href="/tasks" className={shimmerCardClass(data.count)}>
      <CardHeader label="Tasks due today" count={data.count} />
      {data.count === 0 ? (
        <CardEmpty text="No tasks due — nice!" />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {data.preview.map((item) => (
            <li key={item.key} className="text-sm flex items-baseline gap-2">
              <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500 shrink-0">
                {item.badge}
              </span>
              <span className="truncate flex-1">
                {item.title}
                {item.candidateName && (
                  <span className="text-zinc-500"> · {item.candidateName}</span>
                )}
              </span>
              {item.dueAt && (
                <span className="text-xs text-zinc-500 shrink-0">{dueLabel(item.dueAt)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <CardViewAll />
    </Link>
  );
}
