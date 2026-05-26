"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { AnnouncementAudience } from "@/generated/prisma";

const ANNOUNCEMENT_BODY_MAX = 600;

export type AnnouncementActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  body: z.string().trim().min(1).max(ANNOUNCEMENT_BODY_MAX),
  active: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.null()])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

/**
 * Ensure the announcement belongs to the calling tenant admin's org and is
 * a tenant-scope (OWN_ORG) row — platform-scope rows are managed by
 * platform admins under /platform/announcements.
 */
async function requireOrgAnnouncement(id: string, orgId: string) {
  const row = await prisma.announcement.findFirst({
    where: { id, organizationId: orgId, audience: AnnouncementAudience.OWN_ORG },
    select: { id: true },
  });
  if (!row) throw new Error("Announcement not found in this workspace.");
  return row.id;
}

export async function createOrgAnnouncement(
  formData: FormData,
): Promise<AnnouncementActionResult> {
  const { session, orgId } = await requireAdminWithOrg();
  const parsed = formSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const created = await prisma.announcement.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      active: parsed.data.active,
      audience: AnnouncementAudience.OWN_ORG,
      organizationId: orgId,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  revalidatePath("/");
  revalidatePath("/settings/announcements");
  return { ok: true, message: "Announcement created.", id: created.id };
}

export async function updateOrgAnnouncement(
  id: string,
  formData: FormData,
): Promise<AnnouncementActionResult> {
  const { orgId } = await requireAdminWithOrg();
  await requireOrgAnnouncement(id, orgId);
  const parsed = formSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    active: formData.get("active"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  await prisma.announcement.update({
    where: { id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      active: parsed.data.active,
    },
  });
  revalidatePath("/");
  revalidatePath("/settings/announcements");
  return { ok: true, message: "Saved." };
}

export async function setOrgAnnouncementActive(
  id: string,
  active: boolean,
): Promise<AnnouncementActionResult> {
  const { orgId } = await requireAdminWithOrg();
  await requireOrgAnnouncement(id, orgId);
  await prisma.announcement.update({ where: { id }, data: { active } });
  revalidatePath("/");
  revalidatePath("/settings/announcements");
  return { ok: true, message: active ? "Showing on dashboard." : "Hidden from dashboard." };
}

export async function deleteOrgAnnouncement(
  id: string,
): Promise<AnnouncementActionResult> {
  const { orgId } = await requireAdminWithOrg();
  await requireOrgAnnouncement(id, orgId);
  await prisma.announcement.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/settings/announcements");
  return { ok: true, message: "Deleted." };
}
