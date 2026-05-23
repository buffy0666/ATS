"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const candidateSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().max(40).optional().or(z.literal("")).transform((v) => v || null),
  linkedinUrl: z
    .string()
    .url()
    .max(300)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  notes: z.string().optional().or(z.literal("")).transform((v) => v || null),
});

async function saveResume(file: File): Promise<string> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("Resume exceeds 10 MB limit.");
  }
  if (file.type && !ALLOWED_RESUME_TYPES.has(file.type)) {
    throw new Error("Unsupported resume type. Use PDF or DOCX.");
  }
  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/${filename}`;
}

export async function createCandidate(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const data = candidateSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    linkedinUrl: formData.get("linkedinUrl"),
    notes: formData.get("notes"),
  });

  const resume = formData.get("resume");
  let resumeUrl: string | null = null;
  if (resume instanceof File && resume.size > 0) {
    resumeUrl = await saveResume(resume);
  }

  const candidate = await prisma.candidate.create({
    data: { ...data, resumeUrl },
  });

  revalidatePath("/candidates");
  redirect(`/candidates/${candidate.id}`);
}
