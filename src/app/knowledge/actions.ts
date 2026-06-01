"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KnowledgeStatus } from "@/generated/prisma";
import { isAdminOrAbove, requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { removeAttachmentFile, saveAttachment } from "@/lib/uploads";
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_TYPES } from "./constants";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

const inputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  // What kind of knowledge this is.
  type: z.enum(KNOWLEDGE_TYPES),
  // Department this item belongs to.
  category: z.enum(KNOWLEDGE_CATEGORIES),
  url: z
    .string()
    .trim()
    .url()
    .max(1000)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || ""),
  status: z.nativeEnum(KnowledgeStatus).optional().default(KnowledgeStatus.UNDER_REVIEW),
});

type SavedKnowledgeFile = {
  url: string;
  name: string;
  size: number;
  mimeType: string | null;
};

async function saveKnowledgeFile(file: File): Promise<SavedKnowledgeFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" exceeds the 20 MB limit.`);
  }
  if (file.type && !ALLOWED_FILE_TYPES.has(file.type)) {
    throw new Error(`"${file.name}" is an unsupported file type.`);
  }
  return saveAttachment(file, "knowledge");
}

export type AddKnowledgeResult = { ok: true } | { ok: false; error: string };

export async function addKnowledgeItem(formData: FormData): Promise<AddKnowledgeResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const parsed = inputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    type: formData.get("type"),
    category: formData.get("category"),
    url: formData.get("url"),
    status: formData.get("status") || KnowledgeStatus.UNDER_REVIEW,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  // Multiple files may be attached at once (input name="file" with `multiple`).
  // Empty placeholder File entries (size 0) are ignored.
  const files = (formData.getAll("file") as File[]).filter(
    (f) => f instanceof File && f.size > 0,
  );

  let saved: SavedKnowledgeFile[] = [];
  try {
    saved = await Promise.all(files.map((f) => saveKnowledgeFile(f)));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the attachment." };
  }

  // `url` keeps the external link if one was given; otherwise it carries the
  // first uploaded file for back-compat with the list's "Link / File" column.
  // All uploaded files are also recorded as KnowledgeAttachment rows.
  const finalUrl = data.url || saved[0]?.url || "";

  // Only admins (or owners) can set the initial status to APPROVED;
  // everyone else has it forced to UNDER_REVIEW regardless of what they
  // submit.
  const canApprove = isAdminOrAbove(session.user.role);
  const status = canApprove ? data.status : KnowledgeStatus.UNDER_REVIEW;

  await prisma.knowledgeItem.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      category: data.category,
      url: finalUrl,
      status,
      createdById: session.user.id,
      organizationId: orgId,
      attachments:
        saved.length > 0
          ? {
              create: saved.map((s) => ({
                name: s.name,
                url: s.url,
                size: s.size,
                mimeType: s.mimeType,
                uploadedById: session.user.id ?? null,
              })),
            }
          : undefined,
    },
  });

  revalidatePath("/knowledge");
  return { ok: true };
}

/**
 * Add one or more documents to an existing knowledge item. Org-scoped: the
 * item must belong to the caller's org. Creator or admin only (same gate as
 * delete) since attachments are content edits.
 */
export async function addKnowledgeAttachments(
  itemId: string,
  formData: FormData,
): Promise<AddKnowledgeResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const item = await prisma.knowledgeItem.findFirst({
    where: { id: itemId, organizationId: orgId },
    select: { id: true, createdById: true, url: true },
  });
  if (!item) return { ok: false, error: "Item not found." };

  const isAdmin = isAdminOrAbove(session.user.role);
  const isCreator = item.createdById === session.user.id;
  if (!isAdmin && !isCreator) {
    return { ok: false, error: "Only the item's creator or an admin can add files." };
  }

  const files = (formData.getAll("file") as File[]).filter(
    (f) => f instanceof File && f.size > 0,
  );
  if (files.length === 0) return { ok: false, error: "Choose at least one file." };

  let saved: SavedKnowledgeFile[];
  try {
    saved = await Promise.all(files.map((f) => saveKnowledgeFile(f)));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the attachment." };
  }

  await prisma.knowledgeAttachment.createMany({
    data: saved.map((s) => ({
      knowledgeItemId: item.id,
      name: s.name,
      url: s.url,
      size: s.size,
      mimeType: s.mimeType,
      uploadedById: session.user.id ?? null,
    })),
  });

  // Back-fill the item's primary url if it had none, so the list view still
  // shows a "File" link.
  if (!item.url && saved[0]) {
    await prisma.knowledgeItem.update({
      where: { id: item.id },
      data: { url: saved[0].url },
    });
  }

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${item.id}`);
  return { ok: true };
}

/**
 * Remove a single attachment from a knowledge item. Creator or admin only.
 * Best-effort deletes the underlying blob/file too.
 */
export async function deleteKnowledgeAttachment(
  attachmentId: string,
): Promise<AddKnowledgeResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const attachment = await prisma.knowledgeAttachment.findFirst({
    where: { id: attachmentId, knowledgeItem: { organizationId: orgId } },
    select: { id: true, url: true, knowledgeItemId: true, knowledgeItem: { select: { createdById: true } } },
  });
  if (!attachment) return { ok: false, error: "Attachment not found." };

  const isAdmin = isAdminOrAbove(session.user.role);
  const isCreator = attachment.knowledgeItem.createdById === session.user.id;
  if (!isAdmin && !isCreator) {
    return { ok: false, error: "Only the item's creator or an admin can remove files." };
  }

  await prisma.knowledgeAttachment.delete({ where: { id: attachment.id } });
  await removeAttachmentFile(attachment.url).catch(() => {
    // Orphaned blob is acceptable; the row is already gone.
  });

  revalidatePath("/knowledge");
  revalidatePath(`/knowledge/${attachment.knowledgeItemId}`);
  return { ok: true };
}

export async function setKnowledgeStatus(itemId: string, status: KnowledgeStatus) {
  const { session, orgId } = await requireSessionWithOrg();
  if (!isAdminOrAbove(session.user.role)) {
    throw new Error("Only admins can change knowledge item status.");
  }

  await prisma.knowledgeItem.updateMany({
    where: { id: itemId, organizationId: orgId },
    data: { status },
  });

  revalidatePath("/knowledge");
}

export async function deleteKnowledgeItem(itemId: string) {
  const { session, orgId } = await requireSessionWithOrg();

  const item = await prisma.knowledgeItem.findFirst({
    where: { id: itemId, organizationId: orgId },
    select: { createdById: true },
  });
  if (!item) return;

  const isAdmin = isAdminOrAbove(session.user.role);
  const isCreator = item.createdById === session.user.id;
  if (!isAdmin && !isCreator) {
    throw new Error("Only the item's creator or an admin can delete it.");
  }

  await prisma.knowledgeItem.delete({ where: { id: itemId } });
  revalidatePath("/knowledge");
}
