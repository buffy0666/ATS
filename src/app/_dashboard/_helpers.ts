/**
 * Shared helpers for the dashboard tiles. All pure — no I/O, no React, so
 * server components can share them freely.
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "3 minutes ago", "in 2 hours", "yesterday", "in 5 days" — short, recruiter-friendly.
 * Past timestamps return "X ago", future ones return "in X".
 */
export function relativeTime(when: Date | string, now: Date = new Date()): string {
  const t = typeof when === "string" ? new Date(when) : when;
  const diff = t.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const past = diff < 0;

  if (abs < MINUTE) return past ? "just now" : "in a moment";
  if (abs < HOUR) {
    const mins = Math.round(abs / MINUTE);
    return past ? `${mins} min ago` : `in ${mins} min`;
  }
  if (abs < DAY) {
    const hours = Math.round(abs / HOUR);
    return past ? `${hours}h ago` : `in ${hours}h`;
  }
  const days = Math.round(abs / DAY);
  if (days === 1) return past ? "yesterday" : "tomorrow";
  if (days < 30) return past ? `${days}d ago` : `in ${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return past ? `${months}mo ago` : `in ${months}mo`;
  const years = Math.round(months / 12);
  return past ? `${years}y ago` : `in ${years}y`;
}

/** "in 5d", "due now", "1d overdue" — for due-date phrasing in lists. */
export function dueLabel(when: Date, now: Date = new Date()): string {
  const diff = when.getTime() - now.getTime();
  if (Math.abs(diff) < HOUR) return "due now";
  if (diff > 0) {
    const days = Math.round(diff / DAY);
    if (days === 0) return "due today";
    if (days === 1) return "tomorrow";
    return `in ${days}d`;
  }
  const days = Math.round(-diff / DAY);
  if (days === 0) return "due today";
  return `${days}d overdue`;
}

/** Format Date as HH:mm in the user agent's locale (server uses UTC; this is fine for "today" cards). */
export function formatTimeHM(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Number of full days between two Dates, rounded. */
export function daysBetween(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / DAY);
}

/** Today bounds in the server's local time (UTC on most hosts). Good enough for the v1 dashboard. */
export function todayBounds(now: Date = new Date()): { start: Date; endInclusive: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const endInclusive = new Date(now);
  endInclusive.setHours(23, 59, 59, 999);
  return { start, endInclusive };
}

/** Subtract N days from now. */
export function daysAgo(days: number, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d;
}

/** Activity feed event color palette. */
export const ACTIVITY_DOT: Record<string, string> = {
  email: "bg-sky-500",
  note: "bg-amber-500",
  stage: "bg-emerald-500",
  interview: "bg-purple-500",
  enrollment: "bg-indigo-500",
};

// Composite shadow that gives cards a subtle "raised" 3D look:
//   - outer drop shadow for depth
//   - 1px inset top highlight so the upper edge catches light
//   - 1px inset bottom darkening so the lower edge sits down on the page
// Stacked separately for light + dark mode (dark mode uses a much fainter
// top highlight so it doesn't look chalky).
const CARD_EDGE_LIGHT =
  "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_10px_-6px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(0,0,0,0.04)]";
const CARD_EDGE_DARK =
  "dark:shadow-[0_1px_2px_rgba(0,0,0,0.5),0_4px_12px_-6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.3)]";

const CARD_EDGE_HOVER_LIGHT =
  "hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_12px_24px_-12px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-1px_0_rgba(0,0,0,0.05)]";
const CARD_EDGE_HOVER_DARK =
  "dark:hover:shadow-[0_2px_4px_rgba(0,0,0,0.55),0_14px_28px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.09),inset_0_-1px_0_rgba(0,0,0,0.35)]";

/**
 * Card class for the Row 1 tiles. Subtle 3D treatment — beveled top edge,
 * outer drop shadow, faint vertical gradient, and a small lift on hover
 * (these cards are whole-area links). When `count > 0` the shimmer
 * animation paints its own background so we drop the static gradient to
 * avoid conflicting.
 */
export function shimmerCardClass(count: number): string {
  const base = `block rounded-lg p-5 h-full transition-all duration-150 ${CARD_EDGE_LIGHT} ${CARD_EDGE_DARK} ${CARD_EDGE_HOVER_LIGHT} ${CARD_EDGE_HOVER_DARK} hover:-translate-y-0.5 active:translate-y-0`;
  if (count > 0) {
    return `${base} selection-shimmer selection-shimmer-border border-2`;
  }
  return `${base} border border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 hover:border-zinc-300 dark:hover:border-zinc-700`;
}

/**
 * Card class for the wider Row 2/3 panels (funnel, activity feed). Same
 * raised feel as the Row 1 cards, minus the hover lift — they're not
 * whole-area links.
 */
export const panelClass = `rounded-lg border border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 p-5 ${CARD_EDGE_LIGHT} ${CARD_EDGE_DARK}`;
