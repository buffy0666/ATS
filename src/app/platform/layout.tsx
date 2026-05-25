import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth-utils";

/**
 * Platform admin area. Gated centrally so every /platform/* page is
 * protected even if a future page author forgets to call
 * requirePlatformAdmin() themselves.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePlatformAdmin();

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 space-y-6">
      <header className="flex items-end justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
            Platform
          </p>
          <h1 className="text-2xl font-semibold mt-0.5">SaaS operator console</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Cross-tenant view. Anything you do here affects every customer.
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link
            href="/platform"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
          >
            Overview
          </Link>
          <Link
            href="/platform/organizations"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
          >
            Organizations
          </Link>
        </nav>
      </header>
      {children}
    </main>
  );
}
