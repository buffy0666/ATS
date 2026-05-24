"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addNote, deleteNote, updateNote, type NoteActionResult } from "./notes-actions";

type Note = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  author: { name: string | null; email: string };
  application: { id: string; job: { id: string; title: string }; stage: string };
};

type ApplicationOption = { id: string; jobTitle: string; stage: string };

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
 * Layout: persistent compose box at the top, history list below.
 *
 * The compose form is always visible (not gated behind a button). When the
 * candidate has no job applications yet, the form shows a disabled state
 * with a clear hint about why — since notes are still per-application in the
 * schema, the user needs at least one job to attach to.
 *
 * The parent (`page.tsx`) wraps this in an `overflow-y-auto` container, so
 * the history list naturally scrolls when it exceeds the available height.
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
  return (
    <div className="flex flex-col gap-3">
      <AddNoteForm candidateId={candidateId} applications={applications} />

      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 pt-1">
        History {notes.length > 0 && <span className="text-zinc-400">({notes.length})</span>}
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-zinc-500">No notes yet. Add the first one above.</p>
      ) : (
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
      )}
    </div>
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
            {note.application.job.title} ·{" "}
            <span className="uppercase tracking-wide">{note.application.stage}</span>
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
  const hasApplications = applications.length > 0;

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
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
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
        disabled={!hasApplications || pending}
        placeholder={
          hasApplications
            ? "Phone screen at 2pm — strong fit, concerns about comp band."
            : "Associate this candidate with a job to enable notes."
        }
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter submits — keep typing-flow fast.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        className="w-full resize-y rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hasApplications && (
          <select
            name="applicationId"
            required
            defaultValue={applications[0]?.id ?? ""}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-xs"
            aria-label="Job this note is for"
          >
            {applications.map((a) => (
              <option key={a.id} value={a.id}>
                {a.jobTitle} ({a.stage})
              </option>
            ))}
          </select>
        )}

        <button
          type="submit"
          disabled={!hasApplications || pending}
          className="ml-auto rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add note"}
        </button>
      </div>

      {!hasApplications && (
        <p className="mt-2 text-xs text-zinc-500">
          Notes live on a specific job application so the same candidate can have different notes
          per role. Associate this candidate with a job first.
        </p>
      )}
      {state?.ok === false && (
        <p className="mt-2 text-xs text-red-600">{state.error}</p>
      )}
    </form>
  );
}
