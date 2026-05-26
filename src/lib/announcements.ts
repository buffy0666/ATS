import { AnnouncementAudience } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

export type DashboardAnnouncement = {
  id: string;
  title: string | null;
  body: string;
  audience: AnnouncementAudience;
  createdAt: Date;
};

/**
 * Announcements that should appear in the dashboard banner for an org.
 * Combines three sources:
 *   - ALL_TENANTS  (platform-wide, visible to every org)
 *   - SELECTED_TENANTS where this org is listed
 *   - OWN_ORG posted by an admin inside this org
 * Only `active` rows surface. Ordered newest first; cap at 10 in the banner.
 */
export async function loadVisibleAnnouncements(
  organizationId: string,
  limit = 10,
): Promise<DashboardAnnouncement[]> {
  const rows = await prisma.announcement.findMany({
    where: {
      active: true,
      OR: [
        { audience: AnnouncementAudience.ALL_TENANTS },
        { audience: AnnouncementAudience.OWN_ORG, organizationId },
        {
          audience: AnnouncementAudience.SELECTED_TENANTS,
          targets: { some: { organizationId } },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      audience: true,
      createdAt: true,
    },
  });
  return rows;
}

/** Tenant-admin console list — only OWN_ORG announcements in the user's org. */
export async function loadOrgAnnouncements(organizationId: string) {
  return prisma.announcement.findMany({
    where: { organizationId, audience: AnnouncementAudience.OWN_ORG },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      createdBy: { select: { name: true, email: true } },
    },
  });
}

/**
 * Platform-admin console list — every platform-scope announcement plus
 * (read-only context) every OWN_ORG announcement. Platform admins manage
 * the first set; the second is shown so they can see what's out there.
 */
export async function loadPlatformAnnouncements() {
  return prisma.announcement.findMany({
    where: {
      audience: { in: [AnnouncementAudience.ALL_TENANTS, AnnouncementAudience.SELECTED_TENANTS] },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      createdBy: { select: { name: true, email: true } },
      targets: { include: { organization: { select: { id: true, name: true, slug: true } } } },
    },
  });
}

export async function loadAllOrganizationsForPicker() {
  return prisma.organization.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, slug: true },
  });
}
