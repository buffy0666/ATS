"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readCursor, type CandidateCursor } from "@/lib/candidate-cursor";

/**
 * Prev / Next navigation for the candidate detail page.
 *
 * Pulls the most-recent "candidate list cursor" out of localStorage (set by
 * whichever list view the user clicked through from — main /candidates table,
 * /lists/[id], etc.) and walks Prev/Next within that ordering. If no cursor
 * exists or the current candidate isn't in the cursor's id list, hides
 * itself silently so a stranded user (e.g. someone opening the URL fresh)
 * doesn't see broken arrows.
 *
 * Keyboard: ← / → arrow keys move between candidates as long as the user
 * isn't typing in an input.
 */
export function CandidateNavigator({ currentId }: { currentId: string }) {
  const [cursor, setCursor] = useState<CandidateCursor | null>(null);

  // localStorage is unavailable during SSR; read on mount and on focus
  // changes (handles the user editing the cursor in another tab).
  useEffect(() => {
    const sync = () => setCursor(readCursor());
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const index = cursor ? cursor.ids.indexOf(currentId) : -1;

  // Keyboard nav — wire up regardless of cursor state so we don't add/remove
  // listeners as cursor changes. Inside the handler we check whether nav is
  // actually possible.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!cursor || index < 0) return;
      // Don't hijack arrows while typing.
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        window.location.href = `/candidates/${cursor.ids[index - 1]}`;
      } else if (e.key === "ArrowRight" && index < cursor.ids.length - 1) {
        e.preventDefault();
        window.location.href = `/candidates/${cursor.ids[index + 1]}`;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, index]);

  if (!cursor || index < 0) return null;

  const prevId = index > 0 ? cursor.ids[index - 1] : null;
  const nextId = index < cursor.ids.length - 1 ? cursor.ids[index + 1] : null;

  const baseBtn =
    "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800";
  const disabledBtn =
    "rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-sm font-medium text-zinc-400 dark:text-zinc-600 cursor-not-allowed";

  return (
    <div className="flex items-center gap-1.5 text-sm">
      {prevId ? (
        <Link href={`/candidates/${prevId}`} className={baseBtn} aria-label="Previous candidate" title="← Prev (Arrow left)">
          ← Prev
        </Link>
      ) : (
        <span className={disabledBtn} aria-disabled="true">← Prev</span>
      )}

      <span className="text-xs text-zinc-500 tabular-nums px-1">
        {index + 1} of {cursor.ids.length}
      </span>

      {nextId ? (
        <Link href={`/candidates/${nextId}`} className={baseBtn} aria-label="Next candidate" title="Next → (Arrow right)">
          Next →
        </Link>
      ) : (
        <span className={disabledBtn} aria-disabled="true">Next →</span>
      )}

      <Link
        href={cursor.origin.href}
        className="ml-2 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:underline"
        title={`Back to ${cursor.origin.label}`}
      >
        ↩ {cursor.origin.label}
      </Link>
    </div>
  );
}
