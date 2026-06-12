"use client";

import { useState, useTransition } from "react";
import { updateReferredBy, type ReferredByPayload } from "./referred-by-actions";

/**
 * Inline editor for the "Referred by" detail card. The referrer is one of:
 * a workspace user, a client contact, or a free-text name — picked from a
 * single select (users and contacts in optgroups) with an "Other…" option
 * that reveals a text input. Mirrors EditableField's card look so it sits
 * naturally in the Details grid.
 */

const OTHER = "__other__";

export function ReferredByField({
  candidateId,
  display,
  current,
  users,
  contacts,
}: {
  candidateId: string;
  /** Read-mode rendering of the current referrer (link for contacts, etc.). */
  display: React.ReactNode;
  /** Current selection, used to seed the editor. */
  current:
    | { kind: "user"; id: string }
    | { kind: "contact"; id: string }
    | { kind: "name"; name: string }
    | { kind: "none" };
  users: { id: string; label: string }[];
  contacts: { id: string; label: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The select stores "user:<id>" / "contact:<id>" / "" / OTHER.
  const [choice, setChoice] = useState("");
  const [otherName, setOtherName] = useState("");

  function beginEdit() {
    setError(null);
    if (current.kind === "user") setChoice(`user:${current.id}`);
    else if (current.kind === "contact") setChoice(`contact:${current.id}`);
    else if (current.kind === "name") {
      setChoice(OTHER);
      setOtherName(current.name);
    } else setChoice("");
    setEditing(true);
  }

  function save() {
    let payload: ReferredByPayload;
    if (choice === "") payload = { kind: "none" };
    else if (choice === OTHER) payload = { kind: "name", name: otherName };
    else if (choice.startsWith("user:")) payload = { kind: "user", id: choice.slice(5) };
    else payload = { kind: "contact", id: choice.slice(8) };

    setError(null);
    startTransition(async () => {
      const res = await updateReferredBy(candidateId, payload);
      if (res.ok) setEditing(false);
      else setError(res.error);
    });
  }

  if (!editing) {
    return (
      <div
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          beginEdit();
        }}
        title="Click to edit"
        className="group relative w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
      >
        <div className="text-xs uppercase tracking-wide text-zinc-500">Referred by</div>
        <div className="mt-1 break-words text-sm">
          {display ?? <span className="text-zinc-400">—</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-300 bg-white p-3 shadow-sm dark:border-indigo-700 dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-500">Referred by</div>
      <div className="mt-1.5 space-y-1.5">
        <select
          autoFocus
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        >
          <option value="">— None —</option>
          {users.length > 0 && (
            <optgroup label="Team">
              {users.map((u) => (
                <option key={u.id} value={`user:${u.id}`}>
                  {u.label}
                </option>
              ))}
            </optgroup>
          )}
          {contacts.length > 0 && (
            <optgroup label="Client contacts">
              {contacts.map((c) => (
                <option key={c.id} value={`contact:${c.id}`}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          )}
          <option value={OTHER}>Other (type a name)…</option>
        </select>
        {choice === OTHER && (
          <input
            type="text"
            value={otherName}
            onChange={(e) => setOtherName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Referrer's name"
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        )}
      </div>

      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(false);
          }}
          disabled={pending}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
