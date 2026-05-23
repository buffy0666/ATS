"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TaskStatus } from "@/generated/prisma";
import { requireAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { removeAttachmentFile, saveAttachment } from "@/lib/uploads";

const taskSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(50000).optional().nullable(),
  status: z.nativeEnum(TaskStatus),
});

function parseTaskInput(formData: FormData) {
  return taskSchema.parse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    status: formData.get("status"),
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
  const session = await requireAdmin();
  const data = parseTaskInput(formData);

  const task = await prisma.task.create({
    data: { ...data, createdById: session.user.id },
  });

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  await saveTaskAttachments(task.id, files, session.user.id);

  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function updateTask(taskId: string, formData: FormData) {
  await requireAdmin();
  const data = parseTaskInput(formData);

  await prisma.task.update({ where: { id: taskId }, data });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTask(taskId: string) {
  await requireAdmin();

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
  const session = await requireAdmin();
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  await saveTaskAttachments(taskId, files, session.user.id);
  revalidatePath(`/tasks/${taskId}`);
}

export async function deleteTaskAttachment(attachmentId: string) {
  await requireAdmin();
  const attachment = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
    select: { taskId: true, url: true },
  });
  if (!attachment) return;
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
  await removeAttachmentFile(attachment.url);
  revalidatePath(`/tasks/${attachment.taskId}`);
}
