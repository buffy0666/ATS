"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addNote, deleteNote, type NoteActionResult } from "./notes-actions";

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
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Notes & feedback
        </h2>
        <p className="text-sm text-zinc-500">
          Add this candidate to a job first — notes live on the application (so the same person can have different notes per role).
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
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
          {notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              candidateId={candidateId}
              canDelete={n.authorId === currentUserId || currentUserIsAdmin}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteRow({
  note,
  candidateId,
  canDelete,
}: {
  note: Note;
  candidateId: string;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-zinc-500">
          {note.author.name ?? note.author.email}
          {" · "}
          {formatRelative(note.createdAt)}
          {" · "}
          <span className="font-mono text-zinc-400">{note.application.job.title}</span>
          {" — "}
          <span className="uppercase tracking-wide text-[10px]">{note.application.stage}</span>
        </div>
        {canDelete && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("Delete this note?")) return;
              startTransition(() => deleteNote(note.id, candidateId));
            }}
            className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
            aria-label="Delete note"
          >
            ×
          </button>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{note.body}</p>
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
