import Link from "next/link";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import {
  EnrollmentStatus,
  SequenceStepType,
  StepRunStatus,
} from "@/generated/prisma";
import { StepRunRow, type StepRunDue } from "./StepRunRow";

const STEP_TYPE_LABEL: Record<SequenceStepType, string> = {
  EMAIL: "Email",
  CALL: "Call",
  TEXT: "Text",
  LINKEDIN: "LinkedIn",
  TASK: "Task",
};

export default async function SequenceTasksDuePage() {
  const session = await requireSession();
  const userId = session.user.id;

  // Pending, due-today-or-earlier, manual step runs on enrollments the current
  // recruiter started.
  const now = new Date();
  // Roll forward to end-of-day so "due today" is inclusive.
  const dueCutoff = new Date(now);
  dueCutoff.setHours(23, 59, 59, 999);

  const runs = await prisma.stepRun.findMany({
    where: {
      status: StepRunStatus.PENDING,
      scheduledFor: { lte: dueCutoff },
      step: { type: { not: SequenceStepType.EMAIL } },
      enrollment: { enrolledById: userId, status: EnrollmentStatus.ACTIVE },
    },
    orderBy: { scheduledFor: "asc" },
    include: {
      step: true,
      enrollment: {
        include: {
          sequence: { select: { id: true, name: true } },
          candidate: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
        },
      },
    },
  });

  const rows: StepRunDue[] = runs.map((r) => ({
    id: r.id,
    scheduledFor: r.scheduledFor,
    type: r.step.type,
    typeLabel: STEP_TYPE_LABEL[r.step.type],
    taskTitle: r.step.taskTitle ?? "(no title)",
    taskInstructions: r.step.taskInstructions ?? "",
    candidate: {
      id: r.enrollment.candidate.id,
      name: `${r.enrollment.candidate.firstName} ${r.enrollment.candidate.lastName}`,
      email: r.enrollment.candidate.email,
      phone: r.enrollment.candidate.phone,
    },
    sequence: { id: r.enrollment.sequence.id, name: r.enrollment.sequence.name },
  }));

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
      <Link href="/sequences" className="text-sm text-zinc-500 hover:underline">
        ← Sequences
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">Tasks due</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Manual steps from sequences you enrolled candidates in, due today or earlier.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">
          Nothing due. Manual steps (Call / Text / LinkedIn / Task) will show up here when
          their scheduled day arrives.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <StepRunRow key={r.id} run={r} />
          ))}
        </ul>
      )}
    </main>
  );
}
