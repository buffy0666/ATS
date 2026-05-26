import { loadVisibleAnnouncements } from "@/lib/announcements";
import { AnnouncementsBannerClient } from "./AnnouncementsBannerClient";

/**
 * Dashboard announcements strip. Renders nothing when there's no active
 * announcement visible to the org. Up to 10 rotate every 10s in the client
 * component; arrows + dots advance manually.
 */
export async function AnnouncementsBanner({ orgId }: { orgId: string }) {
  const items = await loadVisibleAnnouncements(orgId, 10);
  if (items.length === 0) return null;
  return (
    <AnnouncementsBannerClient
      announcements={items.map((a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
      }))}
    />
  );
}
