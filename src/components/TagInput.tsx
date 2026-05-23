"use client";

import { useState, useRef, useMemo } from "react";
import { tagClass, tagColorForName } from "@/lib/tag-colors";

type Tag = { id: string; name: string; color: string };

export function TagInput({
  name = "tags",
  allTags,
  defaultValue = [],
}: {
  name?: string;
  allTags: Tag[];
  defaultValue?: Tag[];
}) {
  const [selected, setSelected] = useState<Tag[]>(defaultValue);
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = input.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (!normalized) return [];
    return allTags
      .filter(
        (t) =>
          t.name.toLowerCase().includes(normalized) &&
          !selected.some((s) => s.id === t.id),
      )
      .slice(0, 8);
  }, [normalized, allTags, selected]);

  const canAddNew =
    normalized.length > 0 &&
    !allTags.some((t) => t.name.toLowerCase() === normalized) &&
    !selected.some((s) => s.name.toLowerCase() === normalized);

  function addTag(tag: Tag) {
    if (selected.some((s) => s.id === tag.id || s.name.toLowerCase() === tag.name.toLowerCase())) {
      return;
    }
    setSelected([...selected, tag]);
    setInput("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function addNewTag(rawName: string) {
    const trimmed = rawName.trim();
    if (!trimmed) return;
    addTag({
      id: `new:${trimmed}`,
      name: trimmed,
      color: tagColorForName(trimmed),
    });
  }

  function removeTag(id: string) {
    setSelected(selected.filter((s) => s.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && normalized) {
      e.preventDefault();
      const existing = allTags.find((t) => t.name.toLowerCase() === normalized);
      if (existing) addTag(existing);
      else if (canAddNew) addNewTag(input);
    } else if (e.key === "Backspace" && !input && selected.length > 0) {
      setSelected(selected.slice(0, -1));
    }
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 min-h-9">
        {selected.map((t) => (
          <span
            key={t.id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)}`}
          >
            {t.name}
            <button
              type="button"
              aria-label={`Remove ${t.name}`}
              onClick={() => removeTag(t.id)}
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
          placeholder={selected.length === 0 ? "Add tags (type to search or create)" : ""}
          className="flex-1 min-w-32 bg-transparent text-sm focus:outline-none px-1"
        />
      </div>

      {/* Hidden inputs that get submitted with the form */}
      {selected.map((t) => (
        <input key={`hidden-${t.id}`} type="hidden" name={name} value={t.name} />
      ))}

      {open && normalized && (suggestions.length > 0 || canAddNew) && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm">
          {suggestions.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(t)}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-2"
              >
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)}`}>
                  {t.name}
                </span>
              </button>
            </li>
          ))}
          {canAddNew && (
            <li className="border-t border-zinc-200 dark:border-zinc-700">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addNewTag(input)}
                className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
              >
                Create new tag: <span className="font-medium text-zinc-900 dark:text-zinc-100">&quot;{input.trim()}&quot;</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
