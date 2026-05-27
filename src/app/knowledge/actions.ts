"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KnowledgeStatus, Role } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { saveAttachment } from "@/lib/uploads";
import { KNOWLEDGE_TYPES } from "./constants";

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

async function saveKnowledgeFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File exceeds 20 MB limit.");
  }
  if (file.type && !ALLOWED_FILE_TYPES.has(file.type)) {
    throw new Error("Unsupported file type.");
  }
  const result = await saveAttachment(file, "knowledge");
  return result.url;
}

export type AddKnowledgeResult = { ok: true } | { ok: false; error: string };

export async function addKnowledgeItem(formData: FormData): Promise<AddKnowledgeResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const parsed = inputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    type: formData.get("type"),
    url: formData.get("url"),
    status: formData.get("status") || KnowledgeStatus.UNDER_REVIEW,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const file = formData.get("file") as File | null;
  let finalUrl = "";

  // Attachment is optional. If a file is provided it wins; otherwise use the
  // URL if given; otherwise save a name/description-only entry (empty url).
  try {
    if (file && file.size > 0) {
      finalUrl = await saveKnowledgeFile(file);
    } else if (data.url) {
      finalUrl = data.url;
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the attachment." };
  }

  // Only admins can set the initial status to APPROVED; everyone else has it
  // forced to UNDER_REVIEW regardless of what they submit.
  const isAdmin = session.user.role === Role.ADMIN;
  const status = isAdmin ? data.status : KnowledgeStatus.UNDER_REVIEW;

  await prisma.knowledgeItem.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      url: finalUrl,
      status,
      createdById: session.user.id,
      organizationId: orgId,
    },
  });

  revalidatePath("/knowledge");
  return { ok: true };
}

export async function setKnowledgeStatus(itemId: string, status: KnowledgeStatus) {
  const { session, orgId } = await requireSessionWithOrg();
  if (session.user.role !== Role.ADMIN) {
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

  const isAdmin = session.user.role === Role.ADMIN;
  const isOwner = item.createdById === session.user.id;
  if (!isAdmin && !isOwner) {
    throw new Error("Only the item's creator or an admin can delete it.");
  }

  await prisma.knowledgeItem.delete({ where: { id: itemId } });
  revalidatePath("/knowledge");
}
