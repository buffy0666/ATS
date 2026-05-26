import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth-utils";
import {
  loadAllOrganizationsForPicker,
  loadPlatformAnnouncements,
} from "@/lib/announcements";
import {
  PlatformAnnouncementsList,
  type OrgOption,
  type PlatformAnnouncementRow,
} from "./PlatformAnnouncementsList";

export default async function PlatformAnnouncementsPage() {
  await requirePlatformAdmin();
  const [rows, organizations] = await Promise.all([
    loadPlatformAnnouncements(),
    loadAllOrganizationsForPicker(),
  ]);

  const list: PlatformAnnouncementRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    active: r.active,
    audience: r.audience,
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdBy?.name ?? r.createdBy?.email ?? null,
    targets: r.targets.map((t) => t.organization),
  }));
  const orgs: OrgOption[] = organizations;

  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
      <div className="mb-6">
        <Link href="/platform" className="text-sm text-zinc-500 hover:underline">
          ← Platform
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Platform announcements</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Post a message to every tenant or a specific subset. Each post rotates with the
          rest on every targeted workspace&apos;s dashboard. Uncheck &ldquo;Show&rdquo; to
          pause one without deleting it.
        </p>
      </div>
      <PlatformAnnouncementsList rows={list} organizations={orgs} />
    </main>
  );
}
