"use server";

import { revalidatePath } from "next/cache";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { tagColorForName } from "@/lib/tag-colors";

const MAX_NAME = 60;

export type TagActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function clean(name: string): string {
  return name.trim();
}

// Tag.name is still globally unique pre-Phase 6 (commented schema notes plan
// to swap for [organizationId, name]). Until then two orgs can't both name a
// tag the same thing; we surface the duplicate cleanly and otherwise scope
// reads/writes by organizationId so a stranger's tag id can't be touched.
export async function createTag(formData: FormData): Promise<TagActionResult> {
  const { orgId } = await requireAdminWithOrg();
  const name = clean(String(formData.get("name") ?? ""));
  if (!name) return { ok: false, message: "Name is required." };
  if (name.length > MAX_NAME) return { ok: false, message: `Name too long (max ${MAX_NAME}).` };

  try {
    await prisma.tag.create({
      data: { name, color: tagColorForName(name), organizationId: orgId },
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
  const { orgId } = await requireAdminWithOrg();
  const name = clean(nextName);
  if (!name) return { ok: false, message: "Name is required." };
  if (name.length > MAX_NAME) return { ok: false, message: `Name too long (max ${MAX_NAME}).` };

  // updateMany so a cross-tenant id just no-ops instead of throwing P2025
  // (and reveals nothing about other orgs' rows).
  const result = await prisma.tag
    .updateMany({
      where: { id: tagId, organizationId: orgId },
      data: { name },
    })
    .catch(() => ({ count: -1 }));
  if (result.count === -1) {
    return { ok: false, message: `Couldn't rename — "${name}" may already exist.` };
  }
  if (result.count === 0) {
    return { ok: false, message: "Tag not found." };
  }
  invalidateTagViews();
  return { ok: true, message: `Renamed to "${name}".` };
}

export async function deleteTag(tagId: string): Promise<TagActionResult> {
  const { orgId } = await requireAdminWithOrg();
  // Deleting the Tag row removes the implicit M2M join rows automatically.
  // The candidates / clients / contacts themselves are untouched, just untagged.
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, organizationId: orgId },
    select: { name: true },
  });
  if (!tag) return { ok: false, message: "Tag not found." };
  await prisma.tag.deleteMany({ where: { id: tagId, organizationId: orgId } });
  invalidateTagViews();
  return { ok: true, message: `Deleted "${tag.name}".` };
}

function invalidateTagViews() {
  revalidatePath("/settings/tags");
  revalidatePath("/candidates");
  revalidatePath("/clients");
}
