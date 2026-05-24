"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addNote, deleteNote, updateNote, type NoteActionResult } from "./notes-actions";

type Note = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  author: { name: string | null; email: string };
  /** null when this is a candidate-level note (no specific job). */
  application: { id: string; job: { id: string; title: string }; stage: string } | null;
};

type ApplicationOption = { id: string; jobTitle: string; stage: string };

const GENERAL_OPTION_VALUE = "general";

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

function formatAbsolute(date: Date) {
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Layout: persistent compose box at the top, history list below, full-screen
 * pop-out for reviewing long histories.
 *
 * Notes can target a specific job application (per-role feedback) or the
 * candidate directly (general note). The job selector includes a "General
 * note" option for the latter — works even when the candidate isn't on any
 * job yet.
 */
export function NotesSection({
  candidateId,
  notes,
  applications,
  currentUserId,
  currentUserIsAdmin,
}: {
  candidateId: string;
  notes: Note[];
  applications: ApplicationOption[];
  currentUserId: string;
  currentUserIsAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const list = (
    <NoteList
      notes={notes}
      candidateId={candidateId}
      currentUserId={currentUserId}
      currentUserIsAdmin={currentUserIsAdmin}
    />
  );

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <AddNoteForm candidateId={candidateId} applications={applications} />

      <div className="flex items-center justify-between pt-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          History {notes.length > 0 && <span className="text-zinc-400">({notes.length})</span>}
        </h2>
        {notes.length > 2 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:underline"
            aria-label="Open notes in full view"
            title="Open notes in full view"
          >
            ⤢ Pop out
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
        {notes.length === 0 ? (
          <p className="text-sm text-zinc-500">No notes yet. Add the first one above.</p>
        ) : (
          list
        )}
      </div>

      {expanded && (
        <NotesPopout title="Notes history" onClose={() => setExpanded(false)}>
          {list}
        </NotesPopout>
      )}
    </div>
  );
}

function NoteList({
  notes,
  candidateId,
  currentUserId,
  currentUserIsAdmin,
}: {
  notes: Note[];
  candidateId: string;
  currentUserId: string;
  currentUserIsAdmin: boolean;
}) {
  return (
    <ul className="space-y-2">
      {notes.map((n) => {
        const canModify = n.authorId === currentUserId || currentUserIsAdmin;
        return (
          <NoteRow
            key={n.id}
            note={n}
            candidateId={candidateId}
            canEdit={canModify}
            canDelete={canModify}
          />
        );
      })}
    </ul>
  );
}

function NoteRow({
  note,
  candidateId,
  canEdit,
  canDelete,
}: {
  note: Note;
  candidateId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(note.body);
    setError(null);
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Note body can't be empty.");
      return;
    }
    if (trimmed === note.body) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const r = await updateNote(note.id, candidateId, trimmed);
      if (r.ok) {
        setEditing(false);
        setError(null);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <li className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-zinc-500 min-w-0">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {note.author.name ?? note.author.email}
          </span>
          {" · "}
          <span title={formatAbsolute(note.createdAt)}>
            {formatRelative(note.createdAt)}
          </span>
          <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {note.application ? (
              <>
                {note.application.job.title} ·{" "}
                <span className="uppercase tracking-wide">{note.application.stage}</span>
              </>
            ) : (
              <span className="italic">General note</span>
            )}
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-1 shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={startEdit}
                disabled={pending}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-50"
                aria-label="Edit note"
                title="Edit"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!confirm("Delete this note?")) return;
                  startTransition(() => deleteNote(note.id, candidateId));
                }}
                className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50 ml-1"
                aria-label="Delete note"
                title="Delete"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={pending}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              disabled={pending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{note.body}</p>
      )}
    </li>
  );
}

function AddNoteForm({
  candidateId,
  applications,
}: {
  candidateId: string;
  applications: ApplicationOption[];
}) {
  const bound = addNote.bind(null, candidateId);
  const [state, action, pending] = useActionState<NoteActionResult | undefined, FormData>(
    bound,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset the textarea on a successful save so the user can immediately type
  // another note. We keep the job picker on its previously chosen value —
  // recruiters typically batch multiple notes against the same role.
  useEffect(() => {
    if (state?.ok) {
      if (textareaRef.current) textareaRef.current.value = "";
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shrink-0"
    >
      <label htmlFor="note-body" className="sr-only">
        Add a note
      </label>
      <textarea
        ref={textareaRef}
        id="note-body"
        name="body"
        required
        rows={3}
        disabled={pending}
        placeholder={
          applications.length === 0
            ? "General note about this candidate (e.g. impressions, follow-ups, sourcing context)…"
            : "Phone screen at 2pm — strong fit, concerns about comp band."
        }
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter submits — keep typing-flow fast.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        className="w-full resize-y rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm disabled:opacity-60"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          name="applicationId"
          defaultValue={applications[0]?.id ?? GENERAL_OPTION_VALUE}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs"
          aria-label="Job this note is for"
        >
          {applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.jobTitle} ({a.stage})
            </option>
          ))}
          <option value={GENERAL_OPTION_VALUE}>General (no specific job)</option>
        </select>

        <button
          type="submit"
          disabled={pending}
          className="ml-auto rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add note"}
        </button>
      </div>

      {state?.ok === false && (
        <p className="mt-2 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}

/**
 * Full-screen overlay for reading a long notes history without the cramped
 * sidebar panel. Closes on backdrop click or Escape.
 */
function NotesPopout({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // Prevent body scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xl leading-none"
            aria-label="Close"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
