import Link from "next/link";

/**
 * Four primary new-record shortcuts. Visible right under the greeting so the
 * dashboard doubles as a launchpad for the recruiter's most common writes.
 * Capped at four on purpose — adding more turns this into a portal toolbar.
 */

type Action = {
  href: string;
  label: string;
  Icon: () => React.JSX.Element;
  /** Tailwind classes for the icon-tile background. */
  tone: string;
};

const ACTIONS: Action[] = [
  {
    href: "/candidates/new",
    label: "New candidate",
    tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    ),
  },
  {
    href: "/jobs/new",
    label: "New job",
    tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  {
    href: "/interviews/new",
    label: "Schedule interview",
    tone: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
      </svg>
    ),
  },
  {
    href: "/tasks/new",
    label: "New task",
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    Icon: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {ACTIONS.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="
            group flex items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800
            bg-white dark:bg-zinc-900 px-3.5 py-3 text-sm font-medium
            transition-all duration-150
            hover:border-zinc-300 dark:hover:border-zinc-700
            hover:-translate-y-0.5
            shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1)]
            dark:shadow-[0_1px_2px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.55)]
          "
        >
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${a.tone} transition-transform duration-150 group-hover:scale-105`}
            aria-hidden="true"
          >
            <a.Icon />
          </span>
          <span className="truncate">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
