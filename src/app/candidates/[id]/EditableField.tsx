"use client";

import { useState, useTransition } from "react";
import { updateCandidateField, type FieldEditValue } from "./field-edit-actions";

type Option = { value: string; label: string; title?: string };

/** One row in the hover-definitions legend shown via the ⓘ next to a label. */
export type InfoItem = { label: string; description?: string; active?: boolean };

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
  info,
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
  // Optional full-definitions legend. When provided, an ⓘ next to the label
  // reveals every term + definition on hover (the active one highlighted).
  info?: InfoItem[];
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

  const labelRow = (
    <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-zinc-500">
      <span>{label}</span>
      {info && info.length > 0 && <DefinitionsHint items={info} />}
    </div>
  );

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
        {labelRow}
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
      {labelRow}
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
            title={options.find((o) => o.value === draftText)?.title}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            {!required && <option value="">— None —</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value} title={o.title}>
                {o.label}
              </option>
            ))}
          </select>
        ) : type === "multiselect" ? (
          // Vertical, capped-height list — long option sets (e.g. rejection
          // reasons) scroll inside the card instead of stretching it.
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-zinc-200 p-1.5 pr-2 dark:border-zinc-800">
            {options.map((o) => (
              <label
                key={o.value}
                title={o.title}
                className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={draftList.includes(o.value)}
                  onChange={() => toggleListItem(o.value)}
                  className="shrink-0 rounded border-zinc-300 dark:border-zinc-700"
                />
                <span className="truncate">{o.label}</span>
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

/**
 * The ⓘ affordance next to a field label. Pure CSS hover (named group) so it
 * works in both display and edit modes without extra state. stopPropagation
 * on the wrapper keeps a click on the icon from opening the field editor.
 */
function DefinitionsHint({ items }: { items: InfoItem[] }) {
  return (
    <span
      className="group/info relative inline-flex cursor-help"
      onClick={(e) => e.stopPropagation()}
    >
      <InfoIcon className="h-3.5 w-3.5 text-zinc-400 hover:text-indigo-500" />
      <span className="sr-only">Definitions</span>
      <div className="invisible absolute left-0 top-5 z-30 w-64 rounded-md border border-zinc-200 bg-white p-2 text-left text-xs normal-case opacity-0 shadow-lg transition-opacity group-hover/info:visible group-hover/info:opacity-100 dark:border-zinc-700 dark:bg-zinc-900">
        <ul className="space-y-1">
          {items.map((it) => (
            <li
              key={it.label}
              className={it.active ? "rounded bg-indigo-50 px-1 dark:bg-indigo-950/40" : ""}
            >
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">{it.label}</span>
              {it.description && (
                <span className="text-zinc-500 dark:text-zinc-400"> — {it.description}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </span>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M8 15A7 7 0 108 1a7 7 0 000 14zm.75-9.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM7.25 7.5a.75.75 0 011.5 0v3.25a.75.75 0 01-1.5 0V7.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M11.5 2.5l2 2-7.5 7.5-2.5.5.5-2.5 7.5-7.5z" strokeLinejoin="round" />
    </svg>
  );
}
