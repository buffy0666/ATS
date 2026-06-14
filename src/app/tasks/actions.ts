"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  EnrollmentStatus,
  StepRunStatus,
  TaskKind,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma";
import { auditCreate, auditDelete, auditUpdate } from "@/lib/audit/write";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { removeAttachmentFile, saveAttachment } from "@/lib/uploads";
import { taskVisibilityWhere } from "./access";

const optionalEnum = <T extends Record<string, string>>(e: T) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.nativeEnum(e).nullable(),
  );

const optionalString = (max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      return trimmed || null;
    },
    z.string().max(max).nullable(),
  );

const optionalDate = () =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (!trimmed) return null;
      const d = new Date(trimmed);
      return Number.isNaN(d.getTime()) ? null : d;
    },
    z.date().nullable(),
  );

type ActionResult = { ok: true } | { ok: false; error: string };

const taskSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(50000).optional().nullable(),
  status: z.nativeEnum(TaskStatus),
  priority: optionalEnum(TaskPriority),
  dueDate: optionalDate(),
  assignedToId: optionalString(50),
});

function parseTaskInput(formData: FormData) {
  return taskSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    status: formData.get("status"),
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate"),
    assignedToId: formData.get("assignedToId"),
  });
}

async function saveTaskAttachments(taskId: string, files: File[], userId: string) {
  for (const file of files) {
    if (!file || file.size === 0) continue;
    const saved = await saveAttachment(file, "tasks");
    await prisma.taskAttachment.create({
      data: {
        taskId,
        name: saved.name,
        url: saved.url,
        size: saved.size,
        mimeType: saved.mimeType,
        uploadedById: userId,
      },
    });
  }
}

export async function createTask(formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();
  const data = parseTaskInput(formData);

  const task = await prisma.task.create({
    data: { ...data, createdById: session.user.id, organizationId: orgId },
  });
  await auditCreate("Task", task as unknown as Record<string, unknown>);

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  await saveTaskAttachments(task.id, files, session.user.id);

  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function updateTask(taskId: string, formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();
  const data = parseTaskInput(formData);

  // Scoping the lookup by visibility means a recruiter can only update a task
  // they own — a foreign id just falls through to "not found".
  const before = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId: orgId,
      ...taskVisibilityWhere(session.user.role, session.user.id ?? ""),
    },
  });
  if (!before) throw new Error("Task not found.");

  // Stamp/clear completion metadata when the form flips status to/from COMPLETE.
  const now = new Date();
  const completionPatch =
    data.status === TaskStatus.COMPLETE && before.status !== TaskStatus.COMPLETE
      ? { completedAt: now, completedById: session.user.id }
      : data.status !== TaskStatus.COMPLETE && before.status === TaskStatus.COMPLETE
        ? { completedAt: null, completedById: null }
        : {};

  const after = await prisma.task.update({
    where: { id: taskId },
    data: { ...data, ...completionPatch },
  });
  await auditUpdate(
    "Task",
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
  );

  // If this is a sequence task just marked complete, advance the sequence.
  if (
    data.status === TaskStatus.COMPLETE &&
    before.status !== TaskStatus.COMPLETE &&
    before.stepRunId
  ) {
    await closeLinkedStepRun(before.stepRunId, session.user.id ?? "", before.outcomeNote ?? null, now);
  }

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

/**
 * Close the sequence StepRun behind a task (two-way completion) and advance
 * the enrollment if it was the last pending step. No-op if the run is already
 * closed. Mirrors completeStepRun in src/app/sequences/actions.ts.
 */
async function closeLinkedStepRun(
  stepRunId: string,
  userId: string,
  note: string | null,
  now: Date,
): Promise<void> {
  const run = await prisma.stepRun.findUnique({
    where: { id: stepRunId },
    select: {
      id: true,
      status: true,
      enrollmentId: true,
      enrollment: { select: { sequenceId: true } },
    },
  });
  if (!run || run.status !== StepRunStatus.PENDING) return;

  await prisma.stepRun.update({
    where: { id: run.id },
    data: {
      status: StepRunStatus.COMPLETED,
      completedAt: now,
      completedById: userId || null,
      outcomeNote: note,
    },
  });

  const remaining = await prisma.stepRun.count({
    where: { enrollmentId: run.enrollmentId, status: StepRunStatus.PENDING },
  });
  if (remaining === 0) {
    await prisma.sequenceEnrollment.update({
      where: { id: run.enrollmentId },
      data: { status: EnrollmentStatus.COMPLETED, completedAt: now },
    });
  }

  revalidatePath(`/sequences/${run.enrollment.sequenceId}/enrollments`);
  revalidatePath("/sequences/tasks");
}

/**
 * Mark a task complete (the inline action from the task views), capturing an
 * optional outcome note. If the task is a sequence step, closes the linked
 * StepRun and advances the enrollment.
 */
export async function completeTask(
  taskId: string,
  outcomeNote?: string | null,
): Promise<ActionResult> {
  const { session, orgId } = await requireSessionWithOrg();
  const note = optionalString(2000).parse(outcomeNote ?? null);

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId: orgId,
      ...taskVisibilityWhere(session.user.role, session.user.id ?? ""),
    },
    select: { id: true, status: true, stepRunId: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.status === TaskStatus.COMPLETE) return { ok: true };

  const now = new Date();
  await prisma.task.update({
    where: { id: task.id },
    data: {
      status: TaskStatus.COMPLETE,
      completedAt: now,
      completedById: session.user.id,
      outcomeNote: note,
    },
  });

  if (task.stepRunId) {
    await closeLinkedStepRun(task.stepRunId, session.user.id ?? "", note, now);
  }

  revalidatePath("/tasks");
  return { ok: true };
}

/** Reopen a completed task (and its linked step run stays closed — reopening a
 * sequence step would require re-scheduling, which we don't support here). */
export async function reopenTask(taskId: string): Promise<ActionResult> {
  const { session, orgId } = await requireSessionWithOrg();
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId: orgId,
      ...taskVisibilityWhere(session.user.role, session.user.id ?? ""),
    },
    select: { id: true, stepRunId: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (task.stepRunId) {
    return { ok: false, error: "Sequence tasks can't be reopened — they track a completed step." };
  }
  await prisma.task.update({
    where: { id: task.id },
    data: { status: TaskStatus.NOT_STARTED, completedAt: null, completedById: null },
  });
  revalidatePath("/tasks");
  return { ok: true };
}

export async function deleteTask(taskId: string) {
  const { session, orgId } = await requireSessionWithOrg();

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId: orgId,
      ...taskVisibilityWhere(session.user.role, session.user.id ?? ""),
    },
  });
  if (!task) throw new Error("Task not found.");

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId },
    select: { url: true },
  });
  await prisma.task.delete({ where: { id: taskId } });
  await auditDelete("Task", task as unknown as Record<string, unknown>);
  await Promise.all(attachments.map((a) => removeAttachmentFile(a.url)));

  revalidatePath("/tasks");
  redirect("/tasks");
}

export async function addTaskAttachments(taskId: string, formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      organizationId: orgId,
      ...taskVisibilityWhere(session.user.role, session.user.id ?? ""),
    },
    select: { id: true },
  });
  if (!task) throw new Error("Task not found.");

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  await saveTaskAttachments(taskId, files, session.user.id);
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTaskAttachment(attachmentId: string) {
  const { session, orgId } = await requireSessionWithOrg();
  // Join through task to verify the attachment belongs to a task in this org
  // that the caller is allowed to see (their own, or any task for an admin).
  const attachment = await prisma.taskAttachment.findFirst({
    where: {
      id: attachmentId,
      task: {
        organizationId: orgId,
        ...taskVisibilityWhere(session.user.role, session.user.id ?? ""),
      },
    },
    select: { taskId: true, url: true },
  });
  if (!attachment) return;
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  await removeAttachmentFile(attachment.url);
  revalidatePath(`/tasks/${attachment.taskId}`);
}

/**
 * Quick-add a task against a candidate (from the candidate detail page).
 * Defaults to a GENERAL task assigned to the creator.
 */
export async function createCandidateTask(
  candidateId: string,
  input: { name: string; dueDate?: string | null },
): Promise<ActionResult> {
  const { session, orgId } = await requireSessionWithOrg();
  const name = z.string().trim().min(1, "Give the task a name.").max(200).safeParse(input.name);
  if (!name.success) return { ok: false, error: name.error.issues[0]?.message ?? "Invalid name." };
  const due = optionalDate().parse(input.dueDate ?? null);

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!candidate) return { ok: false, error: "Candidate not found." };

  await prisma.task.create({
    data: {
      name: name.data,
      kind: TaskKind.GENERAL,
      status: TaskStatus.NOT_STARTED,
      dueDate: due,
      candidateId,
      organizationId: orgId,
      createdById: session.user.id,
      assignedToId: session.user.id,
    },
  });

  revalidatePath(`/candidates/${candidateId}`);
  revalidatePath("/tasks");
  return { ok: true };
}

// ---------- Bulk operations ----------

const bulkPatchSchema = z.object({
  status: optionalEnum(TaskStatus),
  priority: z
    .preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.union([z.nativeEnum(TaskPriority), z.literal("__clear__"), z.undefined()]),
    )
    .optional(),
  assignedToId: z
    .preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.union([z.string().min(1).max(50), z.literal("__clear__"), z.undefined()]),
    )
    .optional(),
  dueDate: z
    .preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.union([z.string().min(1), z.literal("__clear__"), z.undefined()]),
    )
    .optional(),
});

export type BulkPatchInput = {
  status?: TaskStatus | null;
  priority?: TaskPriority | "__clear__" | null;
  assignedToId?: string | "__clear__" | null;
  dueDate?: string | "__clear__" | null;
};

/**
 * Apply a patch to many tasks at once. Each field is optional — only fields
 * present in `patch` are written. Use the sentinel "__clear__" to set a
 * nullable field back to null.
 */
export async function bulkUpdateTasks(taskIds: string[], patch: BulkPatchInput) {
  const { session, orgId } = await requireSessionWithOrg();
  if (taskIds.length === 0) return { count: 0 };

  const parsed = bulkPatchSchema.parse(patch);

  const data: {
    status?: TaskStatus;
    priority?: TaskPriority | null;
    assignedToId?: string | null;
    dueDate?: Date | null;
  } = {};

  if (parsed.status) data.status = parsed.status;

  if (parsed.priority !== undefined) {
    data.priority = parsed.priority === "__clear__" ? null : parsed.priority;
  }
  if (parsed.assignedToId !== undefined) {
    data.assignedToId = parsed.assignedToId === "__clear__" ? null : parsed.assignedToId;
  }
  if (parsed.dueDate !== undefined) {
    if (parsed.dueDate === "__clear__") {
      data.dueDate = null;
    } else {
      const d = new Date(parsed.dueDate);
      if (Number.isNaN(d.getTime())) {
        throw new Error("Invalid due date.");
      }
      data.dueDate = d;
    }
  }

  if (Object.keys(data).length === 0) return { count: 0 };

  const result = await prisma.task.updateMany({
    where: {
      id: { in: taskIds },
      organizationId: orgId,
      ...taskVisibilityWhere(session.user.role, session.user.id ?? ""),
    },
    data,
  });

  revalidatePath("/tasks");
  return { count: result.count };
}

export async function bulkDeleteTasks(taskIds: string[]) {
  const { session, orgId } = await requireSessionWithOrg();
  if (taskIds.length === 0) return { count: 0 };

  const visibility = taskVisibilityWhere(session.user.role, session.user.id ?? "");

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId: { in: taskIds }, task: { organizationId: orgId, ...visibility } },
    select: { url: true },
  });

  const result = await prisma.task.deleteMany({
    where: { id: { in: taskIds }, organizationId: orgId, ...visibility },
  });
  await Promise.all(attachments.map((a) => removeAttachmentFile(a.url)));

  revalidatePath("/tasks");
  return { count: result.count };
}
