"use client";

import { useState } from "react";

export function SubscribeBlock({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // older browsers — fall back to a manual prompt
      window.prompt("Copy this calendar URL:", url);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Subscribe to calendar
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-[28rem] rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-4 text-sm"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="font-medium mb-2">Personal calendar URL</div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 py-1.5 text-xs font-mono"
            />
            <button
              type="button"
              onClick={copy}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-white dark:text-zinc-900"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <div className="font-medium text-zinc-700 dark:text-zinc-300">How to subscribe</div>
            <p>
              <span className="font-medium">Google Calendar:</span> Other calendars → <span className="font-mono">+</span> → From URL → paste.
            </p>
            <p>
              <span className="font-medium">Outlook (web):</span> Add calendar → Subscribe from web → paste.
            </p>
            <p>
              <span className="font-medium">Outlook (desktop):</span> Add calendar → From Internet → paste.
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Calendars usually refresh every few hours. Treat this URL like a password.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
