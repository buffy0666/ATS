"use client";

import { useState, useTransition } from "react";
import { updateCandidateField, type FieldEditValue } from "./field-edit-actions";

type Option = { value: string; label: string };

export type EditableFieldType =
  | "text"
  | "email"
  | "url"
  | "number"
  | "date"
  | "bool"
  | "select"
  | "multiselect"
  | "list";

export function EditableField({
  candidateId,
  field,
  label,
  type,
  value,
  display,
  options = [],
  placeholder,
  required = false,
}: {
  candidateId: string;
  field: string;
  label: string;
  type: EditableFieldType;
  // Seed value for the editor: string for text/number/date/select,
  // string[] for list/multiselect, boolean for bool.
  value: string | string[] | boolean | null;
  // Optional custom display node (links, formatted dates). Falls back to a
  // value-derived rendering.
  display?: React.ReactNode;
  options?: Option[];
  placeholder?: string;
  required?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [committed, setCommitted] = useState(value);

  // Draft state mirrors the committed value while editing.
  const [draftText, setDraftText] = useState("");
  const [draftBool, setDraftBool] = useState(false);
  const [draftList, setDraftList] = useState<string[]>([]);

  function beginEdit() {
    setError(null);
    if (type === "bool") {
      setDraftBool(committed === true);
    } else if (type === "multiselect") {
      setDraftList(Array.isArray(committed) ? committed : []);
    } else if (type === "list") {
      setDraftText(Array.isArray(committed) ? committed.join(", ") : "");
    } else {
      setDraftText(typeof committed === "string" ? committed : "");
    }
    setEditing(true);
  }

  function buildPayload(): FieldEditValue {
    if (type === "bool") return draftBool;
    if (type === "multiselect") return draftList;
    if (type === "list") {
      return draftText
        .split(type === "list" && field === "otherUrls" ? /[\n,]/ : ",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return draftText;
  }

  function save() {
    const payload = buildPayload();
    setError(null);
    startTransition(async () => {
      const res = await updateCandidateField(candidateId, field, payload);
      if (res.ok) {
        setCommitted(
          type === "bool" || type === "multiselect" || type === "list"
            ? (payload as string | string[] | boolean)
            : (payload as string),
        );
        setEditing(false);
      } else {
        setError(res.error);
      }
    });
  }

  function toggleListItem(v: string) {
    setDraftList((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  // ---- Display mode -------------------------------------------------------
  if (!editing) {
    return (
      <div
        // Click anywhere to edit — but ignore clicks that land on a link
        // inside the value so the link still navigates. (The container is a
        // div, not a button, to keep the nested <a> valid.)
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          beginEdit();
        }}
        title="Click to edit"
        className="group relative w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
      >
        <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="mt-1 break-words text-sm">
          {display ?? renderValue(type, committed, options)}
        </div>
        <button
          type="button"
          onClick={beginEdit}
          aria-label={`Edit ${label}`}
          className="absolute right-1.5 top-1.5 rounded p-1 text-zinc-300 opacity-0 transition-opacity hover:bg-zinc-100 hover:text-indigo-500 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-zinc-800"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ---- Edit mode ----------------------------------------------------------
  return (
    <div className="rounded-lg border border-indigo-300 bg-white p-3 shadow-sm dark:border-indigo-700 dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1.5">
        {type === "bool" ? (
          <select
            autoFocus
            value={draftBool ? "true" : "false"}
            onChange={(e) => setDraftBool(e.target.value === "true")}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        ) : type === "select" ? (
          <select
            autoFocus
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {!required && <option value="">— None —</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : type === "multiselect" ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 py-0.5">
            {options.map((o) => (
              <label key={o.value} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={draftList.includes(o.value)}
                  onChange={() => toggleListItem(o.value)}
                  className="rounded border-zinc-300 dark:border-zinc-700"
                />
                {o.label}
              </label>
            ))}
          </div>
        ) : type === "list" ? (
          <input
            autoFocus
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={placeholder ?? "Comma-separated"}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
        ) : (
          <input
            autoFocus
            type={type === "number" ? "number" : type === "date" ? "date" : type === "email" ? "email" : "text"}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={placeholder}
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

function renderValue(
  type: EditableFieldType,
  value: string | string[] | boolean | null,
  options: Option[],
): React.ReactNode {
  const empty = <span className="text-zinc-400">—</span>;
  if (type === "bool") return value === true ? "Yes" : "No";
  if (type === "select") {
    if (!value || typeof value !== "string") return empty;
    return options.find((o) => o.value === value)?.label ?? value;
  }
  if (type === "multiselect") {
    if (!Array.isArray(value) || value.length === 0) return empty;
    return value.map((v) => options.find((o) => o.value === v)?.label ?? v).join(", ");
  }
  if (type === "list") {
    if (!Array.isArray(value) || value.length === 0) return empty;
    return value.join(", ");
  }
  if (!value || typeof value !== "string") return empty;
  return value;
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M11.5 2.5l2 2-7.5 7.5-2.5.5.5-2.5 7.5-7.5z" strokeLinejoin="round" />
    </svg>
  );
}
