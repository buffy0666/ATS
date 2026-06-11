"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { tagClass } from "@/lib/tag-colors";
import { addTagToCandidate, removeTagFromCandidate } from "./tag-actions";

type Tag = { id: string; name: string; color: string };

/**
 * Inline tag editor for the candidate header: every chip has an always-available
 * "×" to untag in one click, and "+ Tag" adds from existing tags or creates new
 * ones. Updates are optimistic with rollback on failure.
 */
export function CandidateTags({
  candidateId,
  tags,
  allTags,
}: {
  candidateId: string;
  tags: Tag[];
  allTags: Tag[];
}) {
  const [current, setCurrent] = useState<Tag[]>(tags);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = input.trim().toLowerCase();

  // The dropdown is a toggle list: the candidate's own tags first (click to
  // remove), then matching addable tags (click to add).
  const assignedMatches = useMemo(() => {
    if (!normalized) return current;
    return current.filter((t) => t.name.toLowerCase().includes(normalized));
  }, [normalized, current]);

  const suggestions = useMemo(() => {
    const present = new Set(current.map((t) => t.id));
    const pool = allTags.filter((t) => !present.has(t.id));
    if (!normalized) return pool.slice(0, 8);
    return pool.filter((t) => t.name.toLowerCase().includes(normalized)).slice(0, 8);
  }, [normalized, allTags, current]);

  const canCreateNew =
    normalized.length > 0 &&
    !allTags.some((t) => t.name.toLowerCase() === normalized) &&
    !current.some((t) => t.name.toLowerCase() === normalized);

  function remove(tag: Tag) {
    setError(null);
    setCurrent((prev) => prev.filter((t) => t.id !== tag.id));
    startTransition(async () => {
      const r = await removeTagFromCandidate(candidateId, tag.id);
      if (!r.ok) {
        setCurrent((prev) => [...prev, tag]);
        setError(r.error);
      }
    });
  }

  function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (current.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setInput("");
      return;
    }
    setError(null);
    setInput("");
    startTransition(async () => {
      const r = await addTagToCandidate(candidateId, trimmed);
      if (r.ok && r.tag) {
        const tag = r.tag;
        setCurrent((prev) =>
          prev.some((t) => t.id === tag.id) ? prev : [...prev, tag],
        );
      } else if (!r.ok) {
        setError(r.error);
      }
    });
    inputRef.current?.focus();
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {current.map((t) => (
        <span
          key={t.id}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)}`}
        >
          {t.name}
          <button
            type="button"
            aria-label={`Remove tag ${t.name}`}
            title={`Remove tag ${t.name}`}
            onClick={() => remove(t)}
            className="opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <span className="relative">
          <input
            ref={inputRef}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={() => setTimeout(() => setAdding(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && normalized) {
                e.preventDefault();
                const existing = allTags.find((t) => t.name.toLowerCase() === normalized);
                add(existing ? existing.name : input);
              } else if (e.key === "Escape") {
                setAdding(false);
                setInput("");
              }
            }}
            placeholder="Search or create…"
            className="w-36 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          {(assignedMatches.length > 0 || suggestions.length > 0 || canCreateNew) && (
            <ul className="absolute left-0 top-full z-20 mt-1 w-52 max-h-56 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm">
              {assignedMatches.map((t) => (
                <li key={`assigned-${t.id}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => remove(t)}
                    title={`Remove tag ${t.name}`}
                    className="group w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-between gap-2"
                  >
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)} group-hover:line-through`}>
                      {t.name}
                    </span>
                    <span className="text-xs text-emerald-600 group-hover:hidden">✓ tagged</span>
                    <span className="hidden text-xs text-red-600 group-hover:inline">× remove</span>
                  </button>
                </li>
              ))}
              {assignedMatches.length > 0 && (suggestions.length > 0 || canCreateNew) && (
                <li aria-hidden="true" className="border-t border-zinc-200 dark:border-zinc-700" />
              )}
              {suggestions.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(t.name)}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)}`}>
                      {t.name}
                    </span>
                  </button>
                </li>
              ))}
              {canCreateNew && (
                <li className="border-t border-zinc-200 dark:border-zinc-700">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(input)}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  >
                    Create new tag:{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      &quot;{input.trim()}&quot;
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setError(null);
          }}
          className="rounded-full border border-dashed border-zinc-300 dark:border-zinc-600 px-2 py-0.5 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          + Tag
        </button>
      )}

      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
