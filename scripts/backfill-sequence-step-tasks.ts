/**
 * One-time backfill for the task<->sequence integration: create a Task for
 * every in-flight PENDING manual step run (call/text/linkedin/task) and any
 * "send it yourself" email step run that doesn't already have one — so existing
 * enrollments show up in the unified task view.
 *
 * Read-only by default — prints what it would create. Pass --apply to write.
 *   npx tsx scripts/backfill-sequence-step-tasks.ts          # dry run
 *   npx tsx scripts/backfill-sequence-step-tasks.ts --apply  # execute
 */
import { config } from "dotenv";
config();

import {
  PrismaClient,
  SequenceStepType,
  StepRunStatus,
  TaskKind,
  TaskStatus,
} from "../src/generated/prisma";
import { renderTemplate } from "../src/lib/template-renderer";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function taskKindFor(type: SequenceStepType): TaskKind {
  switch (type) {
    case SequenceStepType.CALL: return TaskKind.CALL;
    case SequenceStepType.TEXT: return TaskKind.TEXT;
    case SequenceStepType.LINKEDIN: return TaskKind.LINKEDIN;
    case SequenceStepType.EMAIL: return TaskKind.EMAIL;
    default: return TaskKind.GENERAL;
  }
}

function defaultTaskName(type: SequenceStepType, taskTitle: string | null, subject: string): string {
  if (taskTitle) return taskTitle;
  switch (type) {
    case SequenceStepType.CALL: return "Call candidate";
    case SequenceStepType.TEXT: return "Send a text";
    case SequenceStepType.LINKEDIN: return "LinkedIn touch";
    case SequenceStepType.EMAIL: return subject ? `Send email: ${subject}` : "Send email";
    default: return "Sequence task";
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main() {
  console.log(`=== Backfill sequence step tasks (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const runs = await prisma.stepRun.findMany({
    where: {
      status: StepRunStatus.PENDING,
      task: { is: null },
      OR: [
        { step: { type: { not: SequenceStepType.EMAIL } } },
        { step: { type: SequenceStepType.EMAIL, autoSend: false } },
      ],
    },
    select: {
      id: true,
      scheduledFor: true,
      step: {
        select: { type: true, taskTitle: true, taskInstructions: true, subject: true, body: true },
      },
      enrollment: {
        select: {
          enrolledById: true,
          applicationId: true,
          sequence: { select: { organizationId: true } },
          candidate: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          enrolledBy: { select: { name: true, email: true } },
          application: { select: { job: { select: { title: true } } } },
        },
      },
    },
  });

  console.log(`Found ${runs.length} pending step run(s) without a task.\n`);
  let created = 0;

  for (const run of runs) {
    const e = run.enrollment;
    const c = e.candidate;
    const ctx: Record<string, string> = {
      "candidate.firstName": c.firstName,
      "candidate.lastName": c.lastName,
      "candidate.email": c.email,
      "candidate.phone": c.phone ?? "",
      "sender.name": e.enrolledBy?.name ?? e.enrolledBy?.email ?? "",
      "sender.email": e.enrolledBy?.email ?? "",
      "job.title": e.application?.job.title ?? "",
    };
    const subject = renderTemplate(run.step.subject ?? "", ctx);
    const body = renderTemplate(run.step.body ?? "", ctx);
    const name = defaultTaskName(run.step.type, run.step.taskTitle, subject);
    const description =
      run.step.type === SequenceStepType.EMAIL
        ? `<p><strong>Subject:</strong> ${esc(subject)}</p><hr>${esc(body).replace(/\n/g, "<br>")}`
        : run.step.taskInstructions ?? null;

    console.log(
      `  ${run.step.type.padEnd(9)} ${c.firstName} ${c.lastName} — "${name}" (due ${run.scheduledFor.toISOString().slice(0, 10)})`,
    );

    if (APPLY) {
      await prisma.task.create({
        data: {
          name,
          description,
          kind: taskKindFor(run.step.type),
          status: TaskStatus.NOT_STARTED,
          dueDate: run.scheduledFor,
          assignedToId: e.enrolledById,
          createdById: e.enrolledById,
          organizationId: e.sequence.organizationId,
          candidateId: c.id,
          applicationId: e.applicationId,
          stepRunId: run.id,
        },
      });
    }
    created++;
  }

  console.log(`\n${APPLY ? "Created" : "Would create"} ${created} task(s).`);
  if (!APPLY && created > 0) console.log("Dry run only. Re-run with --apply to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
