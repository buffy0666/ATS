import Link from "next/link";
import { requireSession } from "@/lib/auth-utils";

const TABS = [
  { href: "/settings/tags", label: "Tags" },
  { href: "/settings/choices", label: "Choices" },
  { href: "/settings/api-tokens", label: "API tokens" },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
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
          {TABS.map((t) => (
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
