"use server";

import { revalidatePath } from "next/cache";
import { isAdminOrAbove, requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { removeAttachmentFile, saveAttachment } from "@/lib/uploads";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/gif"]);

export type LogoActionResult =
  | { ok: true; logoUrl: string | null; message: string }
  | { ok: false; message: string };

export async function uploadOrgLogo(formData: FormData): Promise<LogoActionResult> {
  const { session, orgId } = await requireSessionWithOrg();
  if (!isAdminOrAbove(session.user.role)) {
    return { ok: false, message: "Only admins can change the workspace logo." };
  }

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a JPG, PNG or GIF file to upload." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return {
      ok: false,
      message: `Logo too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 5 MB.`,
    };
  }
  if (file.type && !ALLOWED_LOGO_TYPES.has(file.type)) {
    return { ok: false, message: "Logo must be JPG, PNG or GIF." };
  }

  let saved;
  try {
    saved = await saveAttachment(file, "org-logos");
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Upload failed.",
    };
  }

  // Best-effort cleanup of the previous logo file. Fetch first so we know
  // what URL we're replacing.
  const previous = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logoUrl: true },
  });

  await prisma.organization.update({
    where: { id: orgId },
    data: { logoUrl: saved.url },
  });

  if (previous?.logoUrl && previous.logoUrl !== saved.url) {
    await removeAttachmentFile(previous.logoUrl).catch(() => {
      // Ignored — the row already points at the new URL; orphaning the
      // old blob is acceptable.
    });
  }

  revalidatePath("/");
  revalidatePath("/settings/branding");
  return { ok: true, logoUrl: saved.url, message: "Logo updated." };
}

export async function removeOrgLogo(): Promise<LogoActionResult> {
  const { session, orgId } = await requireSessionWithOrg();
  if (!isAdminOrAbove(session.user.role)) {
    return { ok: false, message: "Only admins can change the workspace logo." };
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { logoUrl: true },
  });
  if (!org?.logoUrl) {
    return { ok: true, logoUrl: null, message: "Already no logo." };
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { logoUrl: null },
  });
  await removeAttachmentFile(org.logoUrl).catch(() => {});

  revalidatePath("/");
  revalidatePath("/settings/branding");
  return { ok: true, logoUrl: null, message: "Logo removed." };
}
