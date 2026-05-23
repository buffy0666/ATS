"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

const noteSchema = z.object({
  applicationId: z.string().min(1),
  body: z.string().min(1).max(10000),
});

export type NoteActionResult = { ok: true } | { ok: false; error: string };

export async function addNote(
  candidateId: string,
  _prev: NoteActionResult | undefined,
  formData: FormData,
): Promise<NoteActionResult> {
  const session = await requireSession();

  const parsed = noteSchema.safeParse({
    applicationId: formData.get("applicationId"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // Verify the application belongs to this candidate (prevent cross-write).
  const app = await prisma.application.findFirst({
    where: { id: parsed.data.applicationId, candidateId },
    select: { id: true },
  });
  if (!app) {
    return { ok: false, error: "That application doesn't belong to this candidate." };
  }

  await prisma.note.create({
    data: {
      applicationId: app.id,
      authorId: session.user.id,
      body: parsed.data.body,
    },
  });

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}

export async function updateNote(
  noteId: string,
  candidateId: string,
  body: string,
): Promise<NoteActionResult> {
  const session = await requireSession();

  const parsed = z.string().min(1).max(10000).safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Note body must be 1–10000 characters." };
  }

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      authorId: true,
      application: { select: { candidateId: true } },
    },
  });
  if (!note) return { ok: false, error: "Note not found." };
  if (note.application.candidateId !== candidateId) {
    return { ok: false, error: "Note does not belong to this candidate." };
  }
  if (note.authorId !== session.user.id && session.user.role !== "ADMIN") {
    return { ok: false, error: "Only the note's author or an admin can edit it." };
  }

  await prisma.note.update({
    where: { id: noteId },
    data: { body: parsed.data },
  });

  revalidatePath(`/candidates/${candidateId}`);
  return { ok: true };
}

export async function deleteNote(noteId: string, candidateId: string) {
  const session = await requireSession();

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      authorId: true,
      application: { select: { candidateId: true } },
    },
  });
  if (!note) return;
  if (note.application.candidateId !== candidateId) return;
  if (note.authorId !== session.user.id && session.user.role !== "ADMIN") {
    throw new Error("Only the note's author or an admin can delete it.");
  }

  await prisma.note.delete({ where: { id: noteId } });
  revalidatePath(`/candidates/${candidateId}`);
}
