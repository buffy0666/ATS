"use client";

import { useState, useTransition } from "react";
import { CallOutcome, ContactChannel, EmailDirection } from "@/generated/prisma";
import { logContact, updateContactLog } from "./contact-actions";

/**
 * "Call / SMS / LI" tab content.
 *
 *  - Shared notes textarea on top (optional — the buttons can log
 *    standalone if all you need is the touchpoint stamp).
 *  - Outbound row: Log Call (opens 4 outcome options), Log SMS, Log LI.
 *  - Inbound row:  Rec Call, Rec SMS, Rec LI.
 *  - History below — first ~3 visible, older scroll inside. Each row has
 *    an edit pencil that flips the note into an inline textarea.
 */

export type ContactLogRow = {
  id: string;
  direction: EmailDirection;
  channel: ContactChannel;
  outcome: CallOutcome | null;
  notes: string | null;
  loggedAt: Date;
  loggedBy: { name: string | null; email: string } | null;
};

const CHANNEL_LABEL: Record<ContactChannel, string> = {
  CALL: "Call",
  SMS: "SMS",
  LINKEDIN: "LI",
};

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  BAD_NUMBER: "Bad Number",
  LEFT_VM: "Left VM",
  NO_ANSWER: "No Answer",
  NOT_INTERESTED: "Not Interested",
};

const OUTCOMES: CallOutcome[] = [
  "BAD_NUMBER",
  "LEFT_VM",
  "NO_ANSWER",
  "NOT_INTERESTED",
];

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
  const [showCallOutcomes, setShowCallOutcomes] = useState(false);

  function submit(
    channel: ContactChannel,
    direction: EmailDirection,
    outcome?: CallOutcome,
  ) {
    setError(null);
    const fd = new FormData();
    if (notes.trim()) fd.set("notes", notes);
    fd.set("direction", direction);
    fd.set("channel", channel);
    if (outcome) fd.set("outcome", outcome);
    startTransition(async () => {
      const res = await logContact(candidateId, undefined, fd);
      if (res.ok) {
        setNotes("");
        setShowCallOutcomes(false);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="p-5 space-y-4">
      {/* Composer ----------------------------------------------------------- */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3">
        <label
          htmlFor="contactlog-notes"
          className="block text-xs font-medium uppercase tracking-wide text-zinc-500"
        >
          Note (optional)
        </label>
        <textarea
          id="contactlog-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Optional note — e.g. 'Mentioned the Director role, will follow up Friday.' The buttons below can log on their own without a note."
          className="block w-full resize-y overflow-y-auto rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm leading-relaxed focus:border-zinc-500 focus:outline-none focus:ring-0"
          disabled={pending}
        />

        {/* All six buttons in a single row, left to right: outbound first
            (green), then inbound (blue). A thin divider + slightly larger
            gap signals where the two groups split. Wraps on narrow screens
            so nothing overflows the panel. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Outbound (green) */}
          <button
            type="button"
            onClick={() => setShowCallOutcomes((v) => !v)}
            disabled={pending}
            aria-expanded={showCallOutcomes}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
              showCallOutcomes
                ? "bg-emerald-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            Log Call {showCallOutcomes ? "▴" : "▾"}
          </button>
          <button
            type="button"
            onClick={() => submit(ContactChannel.SMS, EmailDirection.OUTBOUND)}
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Log SMS
          </button>
          <button
            type="button"
            onClick={() => submit(ContactChannel.LINKEDIN, EmailDirection.OUTBOUND)}
            disabled={pending}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Log LI
          </button>

          {/* Divider between the two groups. */}
          <span
            aria-hidden="true"
            className="mx-1 hidden h-6 w-px bg-zinc-300 dark:bg-zinc-700 sm:inline-block"
          />

          {/* Inbound (blue) */}
          <button
            type="button"
            onClick={() => submit(ContactChannel.CALL, EmailDirection.INBOUND)}
            disabled={pending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Rec Call
          </button>
          <button
            type="button"
            onClick={() => submit(ContactChannel.SMS, EmailDirection.INBOUND)}
            disabled={pending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Rec SMS
          </button>
          <button
            type="button"
            onClick={() => submit(ContactChannel.LINKEDIN, EmailDirection.INBOUND)}
            disabled={pending}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Rec LI
          </button>
        </div>

        {/* Call outcome sub-menu — spans below both columns so the four
            outcome buttons get room and don't squeeze the Outbound column. */}
        {showCallOutcomes && (
          <div className="rounded-md border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-2.5">
            <div className="text-[11px] text-emerald-900 dark:text-emerald-200 mb-1.5">
              Pick an outcome — clicking logs the call:
            </div>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() =>
                    submit(ContactChannel.CALL, EmailDirection.OUTBOUND, o)
                  }
                  disabled={pending}
                  className="rounded-md border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

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

  // Roughly three rows visible without scrolling; older entries reachable
  // via the inner scrollbar.
  const MAX_VISIBLE_HEIGHT = "min(60vh, 22rem)";

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
        History ({logs.length})
      </h3>
      <ul
        className="space-y-2 overflow-y-auto pr-1"
        style={{ maxHeight: MAX_VISIBLE_HEIGHT }}
      >
        {logs.map((log) => (
          <ContactLogRowView key={log.id} log={log} />
        ))}
      </ul>
    </div>
  );
}

function ContactLogRowView({ log }: { log: ContactLogRow }) {
  const inbound = log.direction === EmailDirection.INBOUND;
  const directionWord = inbound ? "Received" : "Sent";
  const channelWord = CHANNEL_LABEL[log.channel];
  const outcomeWord = log.outcome ? OUTCOME_LABEL[log.outcome] : null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(log.notes ?? "");
  const [saving, startSave] = useTransition();
  const [saveErr, setSaveErr] = useState<string | null>(null);

  function startEdit() {
    setDraft(log.notes ?? "");
    setSaveErr(null);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
    setSaveErr(null);
  }
  function save() {
    setSaveErr(null);
    startSave(async () => {
      const res = await updateContactLog(log.id, draft);
      if (res.ok) {
        setEditing(false);
      } else {
        setSaveErr(res.error);
      }
    });
  }

  return (
    <li className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <div className="flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-zinc-500">
            {channelWord} {directionWord}
            {outcomeWord && <> · {outcomeWord}</>}
            {" · by "}
            {log.loggedBy?.name ?? log.loggedBy?.email ?? "you"}
            {" · "}
            {formatRelative(log.loggedAt)}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="(no note)"
                className="block w-full resize-y overflow-y-auto rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm leading-relaxed focus:border-zinc-500 focus:outline-none focus:ring-0"
                disabled={saving}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={saving}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1 text-xs"
                >
                  Cancel
                </button>
                {saveErr && (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {saveErr}
                  </span>
                )}
              </div>
            </div>
          ) : log.notes ? (
            <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 mt-1.5">
              {log.notes}
            </p>
          ) : (
            <p className="text-xs italic text-zinc-400 dark:text-zinc-500 mt-1.5">
              No note. Click the pencil to add one.
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!editing && (
            <button
              type="button"
              onClick={startEdit}
              aria-label="Edit note"
              title="Edit note"
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <PencilIcon />
            </button>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
              inbound
                ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
            }`}
          >
            {channelWord} {directionWord}
          </span>
        </div>
      </div>
    </li>
  );
}

function PencilIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
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
