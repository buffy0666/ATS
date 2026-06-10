import "server-only";

import { EnrollmentStatus, SequenceStepType, StepRunStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Derived display status for sequence step runs + enrollment completion.
 *
 * Background: email step runs are written as PENDING and never leave that
 * state (there's no "sent" StepRunStatus, and no delivery webhook/cron). So
 * the raw status badly understates reality — a sent email still reads
 * "pending / due now". We derive the true picture from data we already have:
 *   - `emailLogId != null` on an EMAIL step  ⇒ it was handed to Resend
 *   - `scheduledFor`                          ⇒ sent already vs. scheduled later
 * and reconcile enrollment completion on read (the closest to auto-complete we
 * can get without a dispatcher cron).
 */

export type StepRunForStatus = {
  status: StepRunStatus;
  scheduledFor: Date;
  emailLogId: string | null;
  step: { type: SequenceStepType };
};

export type StepKind =
  | "sent"
  | "scheduled"
  | "failed"
  | "task-done"
  | "task-due"
  | "skipped"
  | "pending";

export type StepDisplay = {
  kind: StepKind;
  label: string;
  /** Counts toward the X/N progress (ATS has finished its part, successfully). */
  done: boolean;
  /** Still awaiting action or future delivery — eligible to be the "next step". */
  upcoming: boolean;
  /** Tailwind background for the per-step status dot. */
  color: string;
};

export function describeStepRun(run: StepRunForStatus, now: Date): StepDisplay {
  const isEmail = run.step.type === SequenceStepType.EMAIL;

  switch (run.status) {
    case StepRunStatus.COMPLETED:
      return { kind: "task-done", label: "Task completed", done: true, upcoming: false, color: "bg-emerald-500" };
    case StepRunStatus.SKIPPED:
      return { kind: "skipped", label: "Skipped", done: true, upcoming: false, color: "bg-zinc-300 dark:bg-zinc-600" };
    case StepRunStatus.FAILED:
      return { kind: "failed", label: "Failed to send", done: false, upcoming: false, color: "bg-red-500" };
    case StepRunStatus.PENDING:
    default:
      if (isEmail) {
        if (run.emailLogId) {
          return run.scheduledFor > now
            ? {
                kind: "scheduled",
                label: `Scheduled for ${run.scheduledFor.toLocaleDateString()}`,
                done: false,
                upcoming: true,
                color: "bg-sky-500",
              }
            : { kind: "sent", label: "Sent", done: true, upcoming: false, color: "bg-emerald-500" };
        }
        // Email step that never reached a successful send and isn't marked FAILED.
        return { kind: "pending", label: "Pending", done: false, upcoming: true, color: "bg-zinc-300 dark:bg-zinc-600" };
      }
      // Manual step (call / linkedin / task) awaiting a recruiter.
      return { kind: "task-due", label: "Task to do", done: false, upcoming: true, color: "bg-amber-500" };
  }
}

/**
 * An enrollment is "done" when every step has reached a terminal, successful
 * state: emails sent (in the past), tasks completed/skipped. A future-scheduled
 * email, a pending task, or a failed step keeps it active (so upcoming work and
 * failures stay visible).
 */
export function isEnrollmentComplete(runs: StepRunForStatus[], now: Date): boolean {
  if (runs.length === 0) return false;
  return runs.every((r) => {
    const kind = describeStepRun(r, now).kind;
    return kind === "sent" || kind === "task-done" || kind === "skipped";
  });
}

/**
 * Reconcile completion on read: flip any ACTIVE enrollment of this sequence
 * whose steps are all terminal to COMPLETED. Safe to call on every page load —
 * it only writes when there's something to complete.
 */
export async function reconcileSequenceEnrollments(sequenceId: string, orgId: string): Promise<void> {
  const now = new Date();
  const active = await prisma.sequenceEnrollment.findMany({
    where: { sequenceId, status: EnrollmentStatus.ACTIVE, sequence: { organizationId: orgId } },
    select: {
      id: true,
      stepRuns: {
        select: {
          status: true,
          scheduledFor: true,
          emailLogId: true,
          step: { select: { type: true } },
        },
      },
    },
  });

  const completedIds = active
    .filter((e) => isEnrollmentComplete(e.stepRuns, now))
    .map((e) => e.id);

  if (completedIds.length === 0) return;

  await prisma.sequenceEnrollment.updateMany({
    where: { id: { in: completedIds }, status: EnrollmentStatus.ACTIVE },
    data: { status: EnrollmentStatus.COMPLETED, completedAt: now },
  });
}
