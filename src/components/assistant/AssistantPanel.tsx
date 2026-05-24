"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAssistant } from "./AssistantProvider";
import { AssistantChat } from "./AssistantChat";

export function AssistantPanel() {
  const { open, setOpen } = useAssistant();

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <>
      {/* Dim background */}
      <div
        className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Assistant"
        className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Assistant
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/assistant"
              onClick={() => setOpen(false)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
              title="Open in full screen"
            >
              ⤢
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <AssistantChat mode="panel" />
        </div>
      </aside>
    </>
  );
}
