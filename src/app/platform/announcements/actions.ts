"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { AnnouncementAudience } from "@/generated/prisma";

export type PlatformAnnouncementResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; message: string };

const ANNOUNCEMENT_BODY_MAX = 600;

const platformFormSchema = z.object({
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
  audience: z.enum([AnnouncementAudience.ALL_TENANTS, AnnouncementAudience.SELECTED_TENANTS]),
  // For SELECTED_TENANTS only. Empty array is rejected post-parse.
  organizationIds: z.array(z.string().min(1)).default([]),
});

function readForm(formData: FormData) {
  return platformFormSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    active: formData.get("active"),
    audience: formData.get("audience"),
    organizationIds: formData.getAll("organizationIds").map(String),
  });
}

async function requirePlatformAnnouncement(id: string) {
  const row = await prisma.announcement.findFirst({
    where: {
      id,
      audience: {
        in: [AnnouncementAudience.ALL_TENANTS, AnnouncementAudience.SELECTED_TENANTS],
      },
    },
    select: { id: true },
  });
  if (!row) throw new Error("Announcement not found at platform scope.");
  return row.id;
}

export async function createPlatformAnnouncement(
  formData: FormData,
): Promise<PlatformAnnouncementResult> {
  const session = await requirePlatformAdmin();
  const parsed = readForm(formData);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { title, body, active, audience, organizationIds } = parsed.data;

  if (audience === AnnouncementAudience.SELECTED_TENANTS && organizationIds.length === 0) {
    return { ok: false, message: "Pick at least one tenant, or change the audience to All tenants." };
  }

  const created = await prisma.announcement.create({
    data: {
      title,
      body,
      active,
      audience,
      createdById: session.user.id,
      targets:
        audience === AnnouncementAudience.SELECTED_TENANTS
          ? {
              create: organizationIds.map((organizationId) => ({ organizationId })),
            }
          : undefined,
    },
    select: { id: true },
  });

  revalidatePath("/");
  revalidatePath("/platform/announcements");
  return { ok: true, message: "Announcement created.", id: created.id };
}

export async function updatePlatformAnnouncement(
  id: string,
  formData: FormData,
): Promise<PlatformAnnouncementResult> {
  await requirePlatformAdmin();
  await requirePlatformAnnouncement(id);
  const parsed = readForm(formData);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { title, body, active, audience, organizationIds } = parsed.data;

  if (audience === AnnouncementAudience.SELECTED_TENANTS && organizationIds.length === 0) {
    return { ok: false, message: "Pick at least one tenant, or change the audience to All tenants." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.announcement.update({
      where: { id },
      data: { title, body, active, audience },
    });
    // Replace the target set rather than diff — small N, simpler to read.
    await tx.announcementTarget.deleteMany({ where: { announcementId: id } });
    if (audience === AnnouncementAudience.SELECTED_TENANTS) {
      await tx.announcementTarget.createMany({
        data: organizationIds.map((organizationId) => ({
          announcementId: id,
          organizationId,
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/platform/announcements");
  return { ok: true, message: "Saved." };
}

export async function setPlatformAnnouncementActive(
  id: string,
  active: boolean,
): Promise<PlatformAnnouncementResult> {
  await requirePlatformAdmin();
  await requirePlatformAnnouncement(id);
  await prisma.announcement.update({ where: { id }, data: { active } });
  revalidatePath("/");
  revalidatePath("/platform/announcements");
  return { ok: true, message: active ? "Live now." : "Hidden." };
}

export async function deletePlatformAnnouncement(
  id: string,
): Promise<PlatformAnnouncementResult> {
  await requirePlatformAdmin();
  await requirePlatformAnnouncement(id);
  await prisma.announcement.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/platform/announcements");
  return { ok: true, message: "Deleted." };
}
