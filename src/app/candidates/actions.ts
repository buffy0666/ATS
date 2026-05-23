"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { saveResume } from "@/lib/uploads";

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
