"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tagColorForName } from "@/lib/tag-colors";

const MAX_NAME = 60;

export type TagActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function clean(name: string): string {
  return name.trim();
}

export async function createTag(formData: FormData): Promise<TagActionResult> {
  await requireSession();
  const name = clean(String(formData.get("name") ?? ""));
  if (!name) return { ok: false, message: "Name is required." };
  if (name.length > MAX_NAME) return { ok: false, message: `Name too long (max ${MAX_NAME}).` };

  try {
    await prisma.tag.create({
      data: { name, color: tagColorForName(name) },
    });
  } catch {
    return { ok: false, message: `A tag named "${name}" already exists.` };
  }
  invalidateTagViews();
  return { ok: true, message: `Created "${name}".` };
}

export async function renameTag(
  tagId: string,
  nextName: string,
): Promise<TagActionResult> {
  await requireSession();
  const name = clean(nextName);
  if (!name) return { ok: false, message: "Name is required." };
  if (name.length > MAX_NAME) return { ok: false, message: `Name too long (max ${MAX_NAME}).` };

  try {
    await prisma.tag.update({
      where: { id: tagId },
      data: { name },
    });
  } catch {
    return { ok: false, message: `Couldn't rename — "${name}" may already exist.` };
  }
  invalidateTagViews();
  return { ok: true, message: `Renamed to "${name}".` };
}

export async function deleteTag(tagId: string): Promise<TagActionResult> {
  await requireSession();
  // Deleting the Tag row removes the implicit M2M join rows automatically.
  // The candidates / clients / contacts themselves are untouched, just untagged.
  const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { name: true } });
  if (!tag) return { ok: false, message: "Tag not found." };
  await prisma.tag.delete({ where: { id: tagId } });
  invalidateTagViews();
  return { ok: true, message: `Deleted "${tag.name}".` };
}

function invalidateTagViews() {
  revalidatePath("/settings/tags");
  revalidatePath("/candidates");
  revalidatePath("/clients");
}
