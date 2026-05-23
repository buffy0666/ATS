"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/sign-out-action";

type NavItem = { href: string; label: string };

const PRIMARY_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/jobs", label: "Jobs" },
  { href: "/candidates", label: "Candidates" },
  { href: "/interviews", label: "Interviews" },
  { href: "/lists", label: "Lists" },
  { href: "/sequences", label: "Sequences" },
  { href: "/knowledge", label: "Knowledge Base" },
  { href: "/templates", label: "Templates" },
];

const ADMIN_ITEMS: NavItem[] = [
  { href: "/tasks", label: "Tasks" },
  { href: "/users", label: "Users" },
  { href: "/settings", label: "Settings" },
];

export function SidebarClient({
  email,
  role,
  isAdmin,
}: {
  email: string;
  role: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col">
      <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <Link href="/" className="font-semibold tracking-tight text-lg">
          ATS
        </Link>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {PRIMARY_ITEMS.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {isAdmin && (
          <>
            <div className="mt-4 px-3 pb-1 text-[10px] uppercase tracking-wider text-zinc-400">
              Admin
            </div>
            {ADMIN_ITEMS.map((item) => (
              <SidebarLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-3 text-sm">
        <div className="px-2 mb-2">
          <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{email}</div>
          <span className="inline-block mt-1 rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">
            {role}
          </span>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full text-left rounded-md px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-800"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`block rounded-md px-3 py-2 text-sm ${
        active
          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium"
          : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
      }`}
    >
      {item.label}
    </Link>
  );
}
