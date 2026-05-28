"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  { href: "/audit", label: "Audit history" },
  { href: "/settings", label: "Settings" },
];

// Visible only to platform admins (the SaaS operator). Distinct from the
// per-tenant Admin section above — these routes show cross-tenant data.
const PLATFORM_ITEMS: NavItem[] = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/organizations", label: "Organizations" },
  { href: "/platform/announcements", label: "Announcements" },
  { href: "/platform/audit", label: "Audit history" },
];

const COLLAPSE_STORAGE_KEY = "ats.sidebar.collapsed.v1";

function initialsFor(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function SidebarClient({
  email,
  role,
  isAdmin,
  isPlatformAdmin,
  organizationName,
  organizationLogoUrl,
}: {
  email: string;
  role: string;
  isAdmin: boolean;
  // SaaS operator — gets the Platform section that spans all tenants.
  // Orthogonal to isAdmin (a platform admin might also be a tenant admin
  // of their own dogfood org).
  isPlatformAdmin: boolean;
  // Multi-tenant: shown above the nav so users know which tenant context
  // they're operating in. Null during the staged migration if the user
  // somehow has no org (Phase 4 onboarding flow catches them earlier).
  organizationName: string | null;
  // Workspace logo. When set, replaces the "ATS" wordmark in the sidebar.
  // Null = fall back to wordmark + org name.
  organizationLogoUrl: string | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read persisted state after mount to avoid SSR / hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed, hydrated]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside
      // sticky + self-start + h-screen pins the sidebar to the viewport
      // while the main column scrolls past it. The inner <nav> already has
      // overflow-y-auto so items still scroll internally on short screens.
      className={`${
        collapsed ? "w-14" : "w-60"
      } shrink-0 self-start sticky top-0 h-screen border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col transition-[width] duration-150`}
    >
      <div
        className={`border-b border-zinc-200 dark:border-zinc-800 ${
          collapsed ? "px-2 py-3 flex justify-center" : "px-5 py-4"
        }`}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title={organizationName ? `Expand sidebar (${organizationName})` : "Expand sidebar"}
            className="h-8 w-8 flex items-center justify-center text-sm rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 overflow-hidden"
          >
            {organizationLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organizationLogoUrl}
                alt={organizationName ?? "Workspace logo"}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              "›"
            )}
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <Link href="/" className="block min-w-0 flex-1 truncate">
                {organizationLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={organizationLogoUrl}
                    alt={organizationName ?? "Workspace logo"}
                    className="h-9 w-auto max-w-full object-contain"
                  />
                ) : (
                  <span className="font-semibold tracking-tight text-lg">ATS</span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="shrink-0 h-6 w-6 flex items-center justify-center text-xs rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                ‹
              </button>
            </div>
            {organizationName && (
              <div
                className="mt-0.5 text-xs text-zinc-500 truncate"
                title={organizationName}
              >
                {organizationName}
              </div>
            )}
          </>
        )}
      </div>

      <nav
        className={`flex-1 py-3 overflow-y-auto ${
          collapsed ? "px-1 space-y-1" : "px-2 space-y-0.5"
        }`}
      >
        {PRIMARY_ITEMS.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}

        {isAdmin && (
          <>
            {collapsed ? (
              <div className="my-2 mx-2 border-t border-zinc-200 dark:border-zinc-800" />
            ) : (
              <div className="mt-4 px-3 pb-1 text-[10px] uppercase tracking-wider text-zinc-400">
                Admin
              </div>
            )}
            {ADMIN_ITEMS.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                collapsed={collapsed}
              />
            ))}
          </>
        )}

        {isPlatformAdmin && (
          <>
            {collapsed ? (
              <div className="my-2 mx-2 border-t border-amber-300 dark:border-amber-700" />
            ) : (
              <div className="mt-4 px-3 pb-1 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
                Platform
              </div>
            )}
            {PLATFORM_ITEMS.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                collapsed={collapsed}
              />
            ))}
          </>
        )}
      </nav>

      <div
        className={`border-t border-zinc-200 dark:border-zinc-800 text-sm ${
          collapsed ? "px-1 py-2" : "px-3 py-3"
        }`}
      >
        {!collapsed && (
          <Link
            href="/profile"
            className="block px-2 mb-2 rounded-md py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="My profile"
          >
            <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{email}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {role}
              </span>
              <span className="text-[10px] text-zinc-500">My profile →</span>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link
            href="/profile"
            aria-label={`My profile (${email})`}
            title={`My profile (${email})`}
            className={`w-full mb-1 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-800 h-9 flex items-center justify-center text-xs ${
              isActive("/profile")
                ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                : ""
            }`}
          >
            {initialsFor(email)}
          </Link>
        )}
        <form action={signOutAction}>
          <button
            type="submit"
            title={collapsed ? `Sign out (${email})` : undefined}
            className={`w-full rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-white dark:hover:bg-zinc-800 ${
              collapsed
                ? "h-9 flex items-center justify-center text-xs"
                : "text-left px-3 py-2 text-sm"
            }`}
          >
            {collapsed ? "⎋" : "Sign out"}
          </button>
        </form>
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={item.label}
        aria-label={item.label}
        className={`flex items-center justify-center h-10 rounded-md text-xs font-medium ${
          active
            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white"
        }`}
      >
        {initialsFor(item.label)}
      </Link>
    );
  }
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
