import Link from "next/link";
import { isOwner, requireSession } from "@/lib/auth-utils";
import { Role } from "@/generated/prisma";

// `tier: "admin"` = visible to OWNER and ADMIN; `tier: "owner"` = OWNER
// only. Recruiters don't see Settings at all (sidebar hides it).
const TABS: { href: string; label: string; tier: "admin" | "owner" }[] = [
  { href: "/settings/branding", label: "Branding", tier: "admin" },
  { href: "/settings/announcements", label: "Announcements", tier: "owner" },
  { href: "/settings/tags", label: "Tags", tier: "admin" },
  { href: "/settings/api-tokens", label: "API tokens", tier: "admin" },
  { href: "/settings/choices", label: "Choices", tier: "admin" },
  { href: "/settings/custom-fields", label: "Custom fields", tier: "admin" },
  { href: "/settings/ai", label: "AI provider", tier: "admin" },
  { href: "/settings/danger", label: "Danger zone", tier: "owner" },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const viewerIsOwner = isOwner(session.user.role as Role);
  const visibleTabs = TABS.filter((t) => t.tier === "admin" || viewerIsOwner);
  return (
    <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage shared workspace data — tags, dropdown options, and other defaults.
        </p>
      </div>
      <nav className="border-b border-zinc-200 dark:border-zinc-800 mb-6">
        <div className="flex gap-1">
          {visibleTabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-t-md px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </main>
  );
}
