"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { cancelScheduledEmail, sendEmail, EmailProviderError } from "@/lib/email";
import { renderTemplate } from "@/lib/template-renderer";
import {
  EmailStatus,
  EnrollmentStatus,
  SequenceStatus,
  SequenceStepType,
  StepRunStatus,
} from "@/generated/prisma";

const MAX_STEPS = 30;

const sequenceMetaSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  status: z.nativeEnum(SequenceStatus).default(SequenceStatus.ACTIVE),
});

const stepSchema = z.object({
  type: z.nativeEnum(SequenceStepType),
  delayDays: z.coerce.number().int().min(0).max(365),
  emailTemplateId: z
    .string()
    .max(40)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  subject: z
    .string()
    .max(998)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  body: z
    .string()
    .max(20000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  taskTitle: z
    .string()
    .max(200)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  taskInstructions: z
    .string()
    .max(5000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export type ActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

// ---------- Sequence CRUD ----------

export async function createSequence(formData: FormData) {
  const session = await requireSession();
  const data = sequenceMetaSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status") || SequenceStatus.ACTIVE,
  });
  const seq = await prisma.sequence.create({
    data: { ...data, createdById: session.user.id },
    select: { id: true },
  });
  revalidatePath("/sequences");
  redirect(`/sequences/${seq.id}`);
}

export async function updateSequenceMeta(
  sequenceId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireSession();
  const data = sequenceMetaSchema.parse({
    name: formData.get("name"),
    description: formData.get("description"),
    status: formData.get("status") || SequenceStatus.ACTIVE,
  });
  await prisma.sequence.update({ where: { id: sequenceId }, data });
  revalidatePath(`/sequences/${sequenceId}`);
  revalidatePath("/sequences");
  return { ok: true, message: "Saved." };
}

export async function deleteSequence(sequenceId: string): Promise<ActionResult> {
  await requireSession();
  // Cancel any still-scheduled emails on active enrollments before tearing down.
  await cancelEmailsForSequence(sequenceId);
  await prisma.sequence.delete({ where: { id: sequenceId } });
  revalidatePath("/sequences");
  redirect("/sequences");
}

// ---------- Steps ----------

export async function addStep(
  sequenceId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireSession();
  const data = stepSchema.parse({
    type: formData.get("type"),
    delayDays: formData.get("delayDays"),
    emailTemplateId: formData.get("emailTemplateId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    taskTitle: formData.get("taskTitle"),
    taskInstructions: formData.get("taskInstructions"),
  });

  const count = await prisma.sequenceStep.count({ where: { sequenceId } });
  if (count >= MAX_STEPS) {
    return { ok: false, message: `Sequences can have at most ${MAX_STEPS} steps.` };
  }

  // Server-side validation that EMAIL has at least a subject + body, and
  // non-EMAIL has a task title. Keeps the UI honest.
  const validation = validateStepContent(data);
  if (!validation.ok) return validation;

  await prisma.sequenceStep.create({
    data: { sequenceId, order: count, ...data },
  });
  revalidatePath(`/sequences/${sequenceId}`);
  return { ok: true, message: "Step added." };
}

export async function updateStep(
  stepId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireSession();
  const data = stepSchema.parse({
    type: formData.get("type"),
    delayDays: formData.get("delayDays"),
    emailTemplateId: formData.get("emailTemplateId"),
    subject: formData.get("subject"),
    body: formData.get("body"),
    taskTitle: formData.get("taskTitle"),
    taskInstructions: formData.get("taskInstructions"),
  });
  const validation = validateStepContent(data);
  if (!validation.ok) return validation;

  const step = await prisma.sequenceStep.update({
    where: { id: stepId },
    data,
    select: { sequenceId: true },
  });
  revalidatePath(`/sequences/${step.sequenceId}`);
  return { ok: true, message: "Step updated." };
}

export async function removeStep(stepId: string): Promise<ActionResult> {
  await requireSession();
  const step = await prisma.sequenceStep.findUnique({
    where: { id: stepId },
    select: { sequenceId: true, order: true },
  });
  if (!step) return { ok: false, message: "Step not found." };

  await prisma.$transaction(async (tx) => {
    await tx.sequenceStep.delete({ where: { id: stepId } });
    // Re-pack `order` so we don't end up with gaps that break the unique index
    // on the next reorder.
    const remaining = await tx.sequenceStep.findMany({
      where: { sequenceId: step.sequenceId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    for (let i = 0; i < remaining.length; i++) {
      await tx.sequenceStep.update({
        where: { id: remaining[i].id },
        data: { order: i },
      });
    }
  });

  revalidatePath(`/sequences/${step.sequenceId}`);
  return { ok: true, message: "Step removed." };
}

export async function moveStep(stepId: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireSession();
  const step = await prisma.sequenceStep.findUnique({
    where: { id: stepId },
    select: { id: true, sequenceId: true, order: true },
  });
  if (!step) return { ok: false, message: "Step not found." };

  const neighbor = await prisma.sequenceStep.findFirst({
    where: {
      sequenceId: step.sequenceId,
      order: direction === "up" ? { lt: step.order } : { gt: step.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
    select: { id: true, order: true },
  });
  if (!neighbor) return { ok: true, message: "Already at the edge." };

  // Two-step swap with a sentinel value because `order` is uniquely indexed
  // per (sequenceId, order). Without the sentinel, the first update would
  // collide with the second.
  await prisma.$transaction(async (tx) => {
    await tx.sequenceStep.update({ where: { id: step.id }, data: { order: -1 } });
    await tx.sequenceStep.update({
      where: { id: neighbor.id },
      data: { order: step.order },
    });
    await tx.sequenceStep.update({
      where: { id: step.id },
      data: { order: neighbor.order },
    });
  });

  revalidatePath(`/sequences/${step.sequenceId}`);
  return { ok: true, message: "Reordered." };
}

function validateStepContent(s: z.infer<typeof stepSchema>): ActionResult {
  if (s.type === SequenceStepType.EMAIL) {
    if (!s.subject || !s.body) {
      return { ok: false, message: "Email steps need a subject and body." };
    }
  } else {
    if (!s.taskTitle) {
      return { ok: false, message: "Manual steps need a task title." };
    }
  }
  return { ok: true, message: "ok" };
}

// ---------- Enrollment ----------

export type EnrollResult = {
  ok: boolean;
  message: string;
  enrolled: number;
  alreadyEnrolled: number;
  failedReason?: string;
};

export async function enrollCandidateInSequence(
  candidateId: string,
  sequenceId: string,
  applicationId?: string | null,
): Promise<EnrollResult> {
  const session = await requireSession();
  const result = await enrollMany([candidateId], sequenceId, applicationId, session.user.id);
  return result;
}

export async function enrollCandidatesInSequence(
  candidateIds: string[],
  sequenceId: string,
): Promise<EnrollResult> {
  const session = await requireSession();
  const cleaned = Array.from(new Set(candidateIds.filter((id) => typeof id === "string" && id))).slice(0, 500);
  if (cleaned.length === 0) {
    return { ok: false, message: "Pick at least one candidate.", enrolled: 0, alreadyEnrolled: 0 };
  }
  return enrollMany(cleaned, sequenceId, null, session.user.id);
}

/**
 * Enroll every member of a candidate list into a sequence. Resolves the
 * member IDs server-side so we don't have to ship thousands of IDs from the
 * client for large lists.
 */
export async function enrollListInSequence(
  listId: string,
  sequenceId: string,
): Promise<EnrollResult> {
  const session = await requireSession();
  if (!listId || !sequenceId) {
    return { ok: false, message: "Pick a list and a sequence.", enrolled: 0, alreadyEnrolled: 0 };
  }

  const list = await prisma.candidateList.findUnique({
    where: { id: listId },
    select: { id: true, scope: true, ownerId: true },
  });
  if (!list) return { ok: false, message: "List not found.", enrolled: 0, alreadyEnrolled: 0 };
  if (list.scope === "PERSONAL" && list.ownerId !== session.user.id) {
    return {
      ok: false,
      message: "You can't enroll from someone else's personal list.",
      enrolled: 0,
      alreadyEnrolled: 0,
    };
  }

  const members = await prisma.candidateListMember.findMany({
    where: { listId },
    select: { candidateId: true },
    take: 500,
  });
  if (members.length === 0) {
    return {
      ok: false,
      message: "This list has no members.",
      enrolled: 0,
      alreadyEnrolled: 0,
    };
  }

  return enrollMany(members.map((m) => m.candidateId), sequenceId, null, session.user.id);
}

async function enrollMany(
  candidateIds: string[],
  sequenceId: string,
  applicationId: string | null | undefined,
  enrolledById: string,
): Promise<EnrollResult> {
  const sequence = await prisma.sequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!sequence) return { ok: false, message: "Sequence not found.", enrolled: 0, alreadyEnrolled: 0 };
  if (sequence.status !== SequenceStatus.ACTIVE) {
    return {
      ok: false,
      message: "Sequence is archived. Reactivate it before enrolling new candidates.",
      enrolled: 0,
      alreadyEnrolled: 0,
    };
  }
  if (sequence.steps.length === 0) {
    return {
      ok: false,
      message: "Sequence has no steps yet — add at least one before enrolling candidates.",
      enrolled: 0,
      alreadyEnrolled: 0,
    };
  }

  // Find which candidates are already enrolled so we can report cleanly.
  const existing = await prisma.sequenceEnrollment.findMany({
    where: { sequenceId, candidateId: { in: candidateIds } },
    select: { candidateId: true },
  });
  const alreadyEnrolledIds = new Set(existing.map((e) => e.candidateId));
  const toEnroll = candidateIds.filter((id) => !alreadyEnrolledIds.has(id));

  const enroller = await prisma.user.findUnique({
    where: { id: enrolledById },
    select: { name: true, email: true },
  });

  let enrolled = 0;
  for (const candidateId of toEnroll) {
    try {
      await runOneEnrollment({
        sequenceId,
        candidateId,
        applicationId: applicationId ?? null,
        enrolledById,
        steps: sequence.steps,
        senderName: enroller?.name ?? enroller?.email ?? null,
        senderEmail: enroller?.email ?? null,
      });
      enrolled++;
    } catch (error) {
      console.error("Failed to enroll candidate", candidateId, error);
    }
  }

  revalidatePath("/sequences");
  revalidatePath(`/sequences/${sequenceId}`);
  revalidatePath(`/sequences/${sequenceId}/enrollments`);
  revalidatePath("/sequences/tasks");

  const alreadyCount = alreadyEnrolledIds.size;
  return {
    ok: true,
    enrolled,
    alreadyEnrolled: alreadyCount,
    message:
      alreadyCount > 0
        ? `Enrolled ${enrolled} candidate${enrolled === 1 ? "" : "s"} (${alreadyCount} already on this sequence).`
        : `Enrolled ${enrolled} candidate${enrolled === 1 ? "" : "s"}.`,
  };
}

type EnrollOneArgs = {
  sequenceId: string;
  candidateId: string;
  applicationId: string | null;
  enrolledById: string;
  steps: { id: string; type: SequenceStepType; delayDays: number; subject: string | null; body: string | null; taskTitle: string | null }[];
  senderName: string | null;
  senderEmail: string | null;
};

async function runOneEnrollment(args: EnrollOneArgs): Promise<void> {
  const { sequenceId, candidateId, applicationId, enrolledById, steps } = args;

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  });
  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);

  const application = applicationId
    ? await prisma.application.findUnique({
        where: { id: applicationId },
        include: { job: { select: { title: true } } },
      })
    : null;

  // Compute cumulative scheduledFor offsets up front so every StepRun is
  // pinned to absolute times — future schema/template tweaks don't drift them.
  const now = new Date();
  const scheduledTimes = computeScheduledTimes(now, steps);

  const enrollment = await prisma.sequenceEnrollment.create({
    data: {
      sequenceId,
      candidateId,
      applicationId: applicationId ?? null,
      enrolledById,
      status: EnrollmentStatus.ACTIVE,
    },
    select: { id: true },
  });

  const ctx = buildTemplateContext({
    candidate,
    sender: { name: args.senderName, email: args.senderEmail },
    jobTitle: application?.job.title ?? null,
  });

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const scheduledFor = scheduledTimes[i];
    await scheduleStepRun({
      enrollmentId: enrollment.id,
      step,
      scheduledFor,
      candidateEmail: candidate.email,
      candidateId,
      applicationId: applicationId ?? null,
      fromUserId: enrolledById,
      replyTo: args.senderEmail ?? undefined,
      ctx,
    });
  }
}

function computeScheduledTimes(
  start: Date,
  steps: { delayDays: number }[],
): Date[] {
  const out: Date[] = [];
  let cursor = new Date(start.getTime());
  for (const s of steps) {
    cursor = new Date(cursor.getTime() + s.delayDays * 24 * 60 * 60 * 1000);
    out.push(new Date(cursor.getTime()));
  }
  return out;
}

type ScheduleArgs = {
  enrollmentId: string;
  step: {
    id: string;
    type: SequenceStepType;
    subject: string | null;
    body: string | null;
  };
  scheduledFor: Date;
  candidateEmail: string | null;
  candidateId: string;
  applicationId: string | null;
  fromUserId: string;
  replyTo?: string;
  ctx: Record<string, string>;
};

async function scheduleStepRun(args: ScheduleArgs): Promise<void> {
  const { step, enrollmentId, scheduledFor, ctx } = args;

  // Non-EMAIL steps are just a PENDING row — recruiters pick them up from the
  // Tasks Due page and mark them done with an outcome note.
  if (step.type !== SequenceStepType.EMAIL) {
    await prisma.stepRun.create({
      data: { enrollmentId, stepId: step.id, scheduledFor, status: StepRunStatus.PENDING },
    });
    return;
  }

  if (!args.candidateEmail) {
    await prisma.stepRun.create({
      data: {
        enrollmentId,
        stepId: step.id,
        scheduledFor,
        status: StepRunStatus.FAILED,
        errorMessage: "Candidate has no email address.",
      },
    });
    return;
  }

  const subject = renderTemplate(step.subject ?? "", ctx);
  const text = renderTemplate(step.body ?? "", ctx);
  const html = text.replace(/\n/g, "<br>");

  try {
    const result = await sendEmail({
      to: args.candidateEmail,
      subject,
      text,
      html,
      replyTo: args.replyTo,
      providerMeta: scheduledFor > new Date()
        ? { scheduledAt: scheduledFor.toISOString() }
        : {},
    });

    const emailLog = await prisma.emailLog.create({
      data: {
        candidateId: args.candidateId,
        applicationId: args.applicationId,
        fromUserId: args.fromUserId,
        to: args.candidateEmail,
        subject,
        bodyText: text,
        bodyHtml: html,
        provider: result.provider,
        providerMessageId: result.id,
        status: EmailStatus.SENT,
        sentAt: scheduledFor,
      },
      select: { id: true },
    });

    await prisma.stepRun.create({
      data: {
        enrollmentId,
        stepId: step.id,
        scheduledFor,
        status: StepRunStatus.PENDING,
        emailLogId: emailLog.id,
        resendScheduledId: result.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send error";
    await prisma.stepRun.create({
      data: {
        enrollmentId,
        stepId: step.id,
        scheduledFor,
        status: StepRunStatus.FAILED,
        errorMessage: message,
      },
    });
  }
}

function buildTemplateContext(input: {
  candidate: { firstName: string; lastName: string; email: string; phone: string | null };
  sender: { name: string | null; email: string | null };
  jobTitle: string | null;
}): Record<string, string> {
  return {
    "candidate.firstName": input.candidate.firstName,
    "candidate.lastName": input.candidate.lastName,
    "candidate.email": input.candidate.email,
    "candidate.phone": input.candidate.phone ?? "",
    "sender.name": input.sender.name ?? "",
    "sender.email": input.sender.email ?? "",
    "job.title": input.jobTitle ?? "",
  };
}

// ---------- Pause / Resume / Cancel ----------

export async function pauseEnrollment(enrollmentId: string): Promise<ActionResult> {
  await requireSession();
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, sequenceId: true, status: true },
  });
  if (!enrollment) return { ok: false, message: "Enrollment not found." };
  if (enrollment.status !== EnrollmentStatus.ACTIVE) {
    return { ok: false, message: "Only active enrollments can be paused." };
  }

  await cancelPendingEmails(enrollmentId);
  await prisma.sequenceEnrollment.update({
    where: { id: enrollmentId },
    data: { status: EnrollmentStatus.PAUSED, pausedAt: new Date() },
  });

  invalidateEnrollmentViews(enrollment.sequenceId);
  return { ok: true, message: "Paused. Scheduled emails canceled with Resend." };
}

export async function resumeEnrollment(enrollmentId: string): Promise<ActionResult> {
  const session = await requireSession();
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      candidate: { select: { firstName: true, lastName: true, email: true, phone: true } },
      application: { include: { job: { select: { title: true } } } },
      enrolledBy: { select: { name: true, email: true } },
      stepRuns: {
        where: { status: StepRunStatus.PENDING },
        include: { step: true },
        orderBy: { scheduledFor: "asc" },
      },
    },
  });
  if (!enrollment) return { ok: false, message: "Enrollment not found." };
  if (enrollment.status !== EnrollmentStatus.PAUSED) {
    return { ok: false, message: "Only paused enrollments can be resumed." };
  }

  const ctx = buildTemplateContext({
    candidate: enrollment.candidate,
    sender: {
      name: enrollment.enrolledBy?.name ?? null,
      email: enrollment.enrolledBy?.email ?? null,
    },
    jobTitle: enrollment.application?.job.title ?? null,
  });

  for (const run of enrollment.stepRuns) {
    if (run.step.type !== SequenceStepType.EMAIL) continue; // Manual steps just stay PENDING.
    if (!enrollment.candidate.email) continue;

    const subject = renderTemplate(run.step.subject ?? "", ctx);
    const text = renderTemplate(run.step.body ?? "", ctx);
    const html = text.replace(/\n/g, "<br>");

    try {
      const result = await sendEmail({
        to: enrollment.candidate.email,
        subject,
        text,
        html,
        replyTo: enrollment.enrolledBy?.email ?? undefined,
        providerMeta:
          run.scheduledFor > new Date() ? { scheduledAt: run.scheduledFor.toISOString() } : {},
      });

      const emailLog = await prisma.emailLog.create({
        data: {
          candidateId: enrollment.candidateId,
          applicationId: enrollment.applicationId,
          fromUserId: session.user.id,
          to: enrollment.candidate.email,
          subject,
          bodyText: text,
          bodyHtml: html,
          provider: result.provider,
          providerMessageId: result.id,
          status: EmailStatus.SENT,
          sentAt: run.scheduledFor,
        },
        select: { id: true },
      });

      await prisma.stepRun.update({
        where: { id: run.id },
        data: { emailLogId: emailLog.id, resendScheduledId: result.id, errorMessage: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown send error";
      await prisma.stepRun.update({
        where: { id: run.id },
        data: { status: StepRunStatus.FAILED, errorMessage: message },
      });
    }
  }

  await prisma.sequenceEnrollment.update({
    where: { id: enrollmentId },
    data: { status: EnrollmentStatus.ACTIVE, pausedAt: null },
  });

  invalidateEnrollmentViews(enrollment.sequenceId);
  return { ok: true, message: "Resumed." };
}

export async function cancelEnrollment(enrollmentId: string): Promise<ActionResult> {
  await requireSession();
  const enrollment = await prisma.sequenceEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, sequenceId: true, status: true },
  });
  if (!enrollment) return { ok: false, message: "Enrollment not found." };
  if (
    enrollment.status === EnrollmentStatus.CANCELED ||
    enrollment.status === EnrollmentStatus.COMPLETED
  ) {
    return { ok: false, message: "Enrollment is already closed." };
  }

  await cancelPendingEmails(enrollmentId);
  await prisma.sequenceEnrollment.update({
    where: { id: enrollmentId },
    data: { status: EnrollmentStatus.CANCELED, completedAt: new Date() },
  });

  invalidateEnrollmentViews(enrollment.sequenceId);
  return { ok: true, message: "Canceled." };
}

async function cancelPendingEmails(enrollmentId: string): Promise<void> {
  const pending = await prisma.stepRun.findMany({
    where: {
      enrollmentId,
      status: StepRunStatus.PENDING,
      resendScheduledId: { not: null },
    },
    select: { id: true, resendScheduledId: true },
  });
  for (const run of pending) {
    if (!run.resendScheduledId) continue;
    try {
      await cancelScheduledEmail(run.resendScheduledId);
    } catch (error) {
      // Log + keep going — a failed cancel shouldn't block the pause.
      if (error instanceof EmailProviderError) {
        console.warn(`Resend cancel failed for ${run.resendScheduledId}:`, error.message);
      } else {
        console.warn("Cancel error:", error);
      }
    }
    await prisma.stepRun.update({
      where: { id: run.id },
      data: { status: StepRunStatus.SKIPPED, resendScheduledId: null },
    });
  }
}

async function cancelEmailsForSequence(sequenceId: string): Promise<void> {
  const enrollments = await prisma.sequenceEnrollment.findMany({
    where: { sequenceId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.PAUSED] } },
    select: { id: true },
  });
  for (const e of enrollments) {
    await cancelPendingEmails(e.id);
  }
}

function invalidateEnrollmentViews(sequenceId: string) {
  revalidatePath(`/sequences/${sequenceId}`);
  revalidatePath(`/sequences/${sequenceId}/enrollments`);
  revalidatePath("/sequences/tasks");
}

// ---------- Manual step completion ----------

const completeSchema = z.object({
  outcome: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
});

export async function completeStepRun(
  stepRunId: string,
  outcomeNote: string,
): Promise<ActionResult> {
  const session = await requireSession();
  const { outcome } = completeSchema.parse({ outcome: outcomeNote });

  const run = await prisma.stepRun.findUnique({
    where: { id: stepRunId },
    include: {
      step: { select: { type: true, sequenceId: true } },
      enrollment: { select: { id: true, sequenceId: true } },
    },
  });
  if (!run) return { ok: false, message: "Step run not found." };
  if (run.status !== StepRunStatus.PENDING) {
    return { ok: false, message: "This step is already closed out." };
  }
  if (run.step.type === SequenceStepType.EMAIL) {
    return { ok: false, message: "Email steps can't be manually completed." };
  }

  await prisma.stepRun.update({
    where: { id: stepRunId },
    data: {
      status: StepRunStatus.COMPLETED,
      completedAt: new Date(),
      completedById: session.user.id,
      outcomeNote: outcome,
    },
  });

  // If this was the last pending step, mark enrollment COMPLETED.
  const remaining = await prisma.stepRun.count({
    where: { enrollmentId: run.enrollmentId, status: StepRunStatus.PENDING },
  });
  if (remaining === 0) {
    await prisma.sequenceEnrollment.update({
      where: { id: run.enrollmentId },
      data: { status: EnrollmentStatus.COMPLETED, completedAt: new Date() },
    });
  }

  invalidateEnrollmentViews(run.step.sequenceId);
  return { ok: true, message: "Marked done." };
}
