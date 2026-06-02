"use client";

import { useState, useRef, useMemo } from "react";

export type EntityOption = { id: string; label: string };

/**
 * A closed-set multi-select chip picker for choosing existing entities (jobs,
 * users, etc.) by id. Unlike TagInput it never creates new options. Selected
 * ids are submitted via hidden inputs under `name`, so the server reads them
 * with `formData.getAll(name)`.
 *
 * Controlled when `onChange` is provided (e.g. inside a manually-built
 * FormData flow); otherwise self-managed via `defaultValue` for plain form
 * posts.
 */
export function EntityMultiSelect({
  name,
  options,
  defaultValue = [],
  value,
  onChange,
  placeholder = "Type to search…",
}: {
  name: string;
  options: EntityOption[];
  defaultValue?: EntityOption[];
  value?: EntityOption[];
  onChange?: (selected: EntityOption[]) => void;
  placeholder?: string;
}) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<EntityOption[]>(defaultValue);
  const selected = isControlled ? value! : internal;
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = input.trim().toLowerCase();

  function setSelected(next: EntityOption[]) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }

  const suggestions = useMemo(() => {
    return options
      .filter(
        (o) =>
          (!normalized || o.label.toLowerCase().includes(normalized)) &&
          !selected.some((s) => s.id === o.id),
      )
      .slice(0, 8);
  }, [normalized, options, selected]);

  function add(option: EntityOption) {
    if (selected.some((s) => s.id === option.id)) return;
    setSelected([...selected, option]);
    setInput("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    setSelected(selected.filter((s) => s.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && suggestions.length > 0) {
      e.preventDefault();
      add(suggestions[0]);
    } else if (e.key === "Backspace" && !input && selected.length > 0) {
      remove(selected[selected.length - 1].id);
    }
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 min-h-9">
        {selected.map((o) => (
          <span
            key={o.id}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          >
            {o.label}
            <button
              type="button"
              aria-label={`Remove ${o.label}`}
              onClick={() => remove(o.id)}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? placeholder : ""}
          className="flex-1 min-w-32 bg-transparent text-sm focus:outline-none px-1"
        />
      </div>

      {/* Hidden inputs submitted with the form (ids, not labels) */}
      {selected.map((o) => (
        <input key={`hidden-${o.id}`} type="hidden" name={name} value={o.id} />
      ))}

      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm">
          {suggestions.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(o)}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
