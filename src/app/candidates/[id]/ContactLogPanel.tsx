"use client";

import { useRef, useState, useTransition } from "react";
import { EmailDirection } from "@/generated/prisma";
import { logContact } from "./contact-actions";

/**
 * "Call / SMS / LI" tab content. Tiny composer at the top (4-row notes
 * box + two log buttons for direction), and below it the history of
 * everything logged — first three visible, older entries reachable via
 * the inner scrollbar. Mirrors the email-history idiom (Sent vs Received
 * badges, "by <user>", relative time).
 */

export type ContactLogRow = {
  id: string;
  direction: EmailDirection;
  notes: string;
  loggedAt: Date;
  loggedBy: { name: string | null; email: string } | null;
};

export function ContactLogPanel({
  candidateId,
  logs,
}: {
  candidateId: string;
  logs: ContactLogRow[];
}) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function submit(direction: EmailDirection) {
    if (!notes.trim()) {
      setError("Add a note before logging.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("notes", notes);
    fd.set("direction", direction);
    startTransition(async () => {
      const res = await logContact(candidateId, undefined, fd);
      if (res.ok) {
        setNotes("");
        // revalidatePath in the action refreshes server data; the page's
        // RSC re-render flushes the new entry into the list below.
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="p-5 space-y-4">
      {/* Composer ----------------------------------------------------------- */}
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
      >
        <label
          htmlFor="contactlog-notes"
          className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
        >
          What happened?
        </label>
        <textarea
          id="contactlog-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="e.g. Left voicemail mentioning the Director role. Will follow up Friday."
          className="block w-full resize-y overflow-y-auto rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm leading-relaxed focus:border-zinc-500 focus:outline-none focus:ring-0"
          disabled={pending}
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => submit(EmailDirection.OUTBOUND)}
            disabled={pending || !notes.trim()}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
          >
            {pending ? "Logging…" : "Log Call / SMS / LI"}
          </button>
          <button
            type="button"
            onClick={() => submit(EmailDirection.INBOUND)}
            disabled={pending || !notes.trim()}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-sky-700"
          >
            {pending ? "Logging…" : "Log Received Call / SMS / LI"}
          </button>
          {error && (
            <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
          )}
        </div>
      </form>

      {/* History ------------------------------------------------------------ */}
      <ContactLogHistory logs={logs} />
    </div>
  );
}

function ContactLogHistory({ logs }: { logs: ContactLogRow[] }) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No calls, SMS or LinkedIn messages logged yet.
      </p>
    );
  }

  // First three entries are visible without scrolling; older ones reachable
  // via the inner scrollbar. Tuned to roughly three card-heights at the
  // default 13px summary row.
  const MAX_VISIBLE_HEIGHT = "min(60vh, 19rem)";

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        History ({logs.length})
      </h3>
      <ul
        className="space-y-2 overflow-y-auto pr-1"
        style={{ maxHeight: MAX_VISIBLE_HEIGHT }}
      >
        {logs.map((log) => {
          const inbound = log.direction === EmailDirection.INBOUND;
          return (
            <li
              key={log.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500">
                    {inbound ? "Received" : "Sent"} by{" "}
                    {log.loggedBy?.name ?? log.loggedBy?.email ?? "you"} ·{" "}
                    {formatRelative(log.loggedAt)}
                  </div>
                  <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 mt-1.5">
                    {log.notes}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                    inbound
                      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                  }`}
                >
                  {inbound ? "Received" : "Sent"}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatRelative(date: Date) {
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
