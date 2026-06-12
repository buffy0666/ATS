import { requireOwnerWithOrg } from "@/lib/auth-utils";
import { loadOrgAnnouncements } from "@/lib/announcements";
import { AnnouncementsList, type AnnouncementRow } from "./AnnouncementsList";

export default async function AnnouncementsSettingsPage() {
  const { orgId } = await requireOwnerWithOrg();
  const rows = await loadOrgAnnouncements(orgId);
  const list: AnnouncementRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdBy?.name ?? r.createdBy?.email ?? null,
  }));
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Workspace announcements</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Short messages that rotate at the top of everyone&apos;s dashboard in this workspace.
          Uncheck &ldquo;Show&rdquo; to pause one without deleting it.
        </p>
      </div>
      <AnnouncementsList rows={list} />
    </section>
  );
}
