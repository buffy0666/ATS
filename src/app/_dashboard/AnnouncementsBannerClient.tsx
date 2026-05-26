"use client";

import { useEffect, useState } from "react";
import type { AnnouncementAudience } from "@/generated/prisma";

export type BannerAnnouncement = {
  id: string;
  title: string | null;
  body: string;
  audience: AnnouncementAudience;
};

const ROTATION_MS = 10_000;

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  OWN_ORG: "Workspace",
  ALL_TENANTS: "Platform",
  SELECTED_TENANTS: "Platform",
};

const AUDIENCE_CHIP: Record<AnnouncementAudience, string> = {
  OWN_ORG: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  ALL_TENANTS: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  SELECTED_TENANTS: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
};

export function AnnouncementsBannerClient({
  announcements,
}: {
  announcements: BannerAnnouncement[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = announcements.length;

  // Auto-rotate. Reset whenever the user advances manually (handled by
  // restarting the effect via `index` in deps).
  useEffect(() => {
    if (count <= 1 || paused) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATION_MS);
    return () => clearTimeout(t);
  }, [index, count, paused]);

  if (count === 0) return null;
  const current = announcements[Math.min(index, count - 1)];

  function next() {
    setIndex((i) => (i + 1) % count);
  }
  function prev() {
    setIndex((i) => (i - 1 + count) % count);
  }

  return (
    <section
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 px-4 py-3 shadow-sm"
      role="region"
      aria-label="Workspace announcements"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 mt-0.5 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium ${AUDIENCE_CHIP[current.audience]}`}
        >
          {AUDIENCE_LABEL[current.audience]}
        </span>
        <div className="flex-1 min-w-0">
          {current.title && (
            <div className="text-sm font-semibold truncate">{current.title}</div>
          )}
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
            {current.body}
          </p>
        </div>
        {count > 1 && (
          <div className="shrink-0 flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={prev}
              aria-label="Previous announcement"
              className="h-7 w-7 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ‹
            </button>
            <span className="text-xs text-zinc-500 tabular-nums w-10 text-center">
              {index + 1} / {count}
            </span>
            <button
              type="button"
              onClick={next}
              aria-label="Next announcement"
              className="h-7 w-7 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ›
            </button>
          </div>
        )}
      </div>
      {count > 1 && (
        <div className="mt-2 flex gap-1">
          {announcements.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to announcement ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1 rounded-full transition-all ${
                i === index
                  ? "bg-zinc-900 dark:bg-zinc-100 flex-[3]"
                  : "bg-zinc-300 dark:bg-zinc-700 flex-1 hover:bg-zinc-400 dark:hover:bg-zinc-600"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
