"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TaskPriority, TaskStatus } from "@/generated/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { removeAttachmentFile, saveAttachment } from "@/lib/uploads";

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
  const { session, orgId } = await requireAdminWithOrg();
  const data = parseTaskInput(formData);

  const task = await prisma.task.create({
    data: { ...data, createdById: session.user.id, organizationId: orgId },
  });

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  await saveTaskAttachments(task.id, files, session.user.id);

  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function updateTask(taskId: string, formData: FormData) {
  const { orgId } = await requireAdminWithOrg();
  const data = parseTaskInput(formData);

  const existing = await prisma.task.findFirst({
    where: { id: taskId, organizationId: orgId },
    select: { id: true },
  });
  if (!existing) throw new Error("Task not found.");

  await prisma.task.update({ where: { id: taskId }, data });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTask(taskId: string) {
  const { orgId } = await requireAdminWithOrg();

  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: orgId },
    select: { id: true },
  });
  if (!task) throw new Error("Task not found.");

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId },
    select: { url: true },
  });
  await prisma.task.delete({ where: { id: taskId } });
  await Promise.all(attachments.map((a) => removeAttachmentFile(a.url)));

  revalidatePath("/tasks");
  redirect("/tasks");
}

export async function addTaskAttachments(taskId: string, formData: FormData) {
  const { session, orgId } = await requireAdminWithOrg();
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: orgId },
    select: { id: true },
  });
  if (!task) throw new Error("Task not found.");

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  await saveTaskAttachments(taskId, files, session.user.id);
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTaskAttachment(attachmentId: string) {
  const { orgId } = await requireAdminWithOrg();
  // Join through task to verify the attachment belongs to a task in this org.
  const attachment = await prisma.taskAttachment.findFirst({
    where: { id: attachmentId, task: { organizationId: orgId } },
    select: { taskId: true, url: true },
  });
  if (!attachment) return;
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  await removeAttachmentFile(attachment.url);
  revalidatePath(`/tasks/${attachment.taskId}`);
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
  const { orgId } = await requireAdminWithOrg();
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
    where: { id: { in: taskIds }, organizationId: orgId },
    data,
  });

  revalidatePath("/tasks");
  return { count: result.count };
}

export async function bulkDeleteTasks(taskIds: string[]) {
  const { orgId } = await requireAdminWithOrg();
  if (taskIds.length === 0) return { count: 0 };

  const attachments = await prisma.taskAttachment.findMany({
    where: { taskId: { in: taskIds }, task: { organizationId: orgId } },
    select: { url: true },
  });

  const result = await prisma.task.deleteMany({
    where: { id: { in: taskIds }, organizationId: orgId },
  });
  await Promise.all(attachments.map((a) => removeAttachmentFile(a.url)));

  revalidatePath("/tasks");
  return { count: result.count };
}
