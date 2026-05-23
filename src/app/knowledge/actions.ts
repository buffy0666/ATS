"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

async function saveKnowledgeFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File exceeds 20 MB limit.");
  }
  if (file.type && !ALLOWED_FILE_TYPES.has(file.type)) {
    throw new Error("Unsupported file type.");
  }

  const dir = path.join(process.cwd(), "public", "uploads", "knowledge");
  await fs.mkdir(dir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  return `/uploads/knowledge/${filename}`;
}

export async function addKnowledgeItem(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string;
  const linkUrl = formData.get("url") as string;
  const file = formData.get("file") as File | null;

  if (!name) return;

  let finalUrl = "";

  if (type === "link" && linkUrl) {
    finalUrl = linkUrl;
  } else if (type === "document" && file && file.size > 0) {
    finalUrl = await saveKnowledgeFile(file);
  } else {
    return;
  }

  await prisma.knowledgeItem.create({
    data: { name, type, url: finalUrl },
  });

  revalidatePath("/knowledge");
}
