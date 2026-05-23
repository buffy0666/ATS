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
  const [open, setOpen] = useState(false);

  if (applications.length === 0) {
    return (
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Notes &amp; feedback
        </h2>
        <p className="text-sm text-zinc-500">
          Add this candidate to a job first — notes live on the application (so the same person can have different notes per role).
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Notes &amp; feedback ({notes.length})
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium"
          >
            Add note
          </button>
        )}
      </div>

      {open && (
        <AddNoteForm
          candidateId={candidateId}
          applications={applications}
          onCancel={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      )}

      {notes.length === 0 && !open ? (
        <p className="text-sm text-zinc-500">No notes yet.</p>
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
    </section>
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
  onCancel,
  onSaved,
}: {
  candidateId: string;
  applications: ApplicationOption[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const bound = addNote.bind(null, candidateId);
  const [state, action, pending] = useActionState<NoteActionResult | undefined, FormData>(
    bound,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      onSaved();
    }
  }, [state, onSaved]);

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 mb-3"
    >
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="applicationId">
          For which job?
        </label>
        <select
          id="applicationId"
          name="applicationId"
          required
          defaultValue={applications[0]?.id ?? ""}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        >
          {applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.jobTitle} ({a.stage})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="body">
          Note
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={4}
          placeholder="Phone screen at 2pm — strong fit, concerns about comp band."
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
      {state?.ok === false && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save note"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
