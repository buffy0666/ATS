"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCandidateToJob } from "../actions";

type Option = { id: string; firstName: string; lastName: string; email: string };

const MAX_RESULTS = 50;

export function AddCandidateForm({
  jobId,
  candidates,
}: {
  jobId: string;
  candidates: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Option | null>(null);
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Pre-lower-case once per candidate for fast filtering.
  const indexed = useMemo(
    () =>
      candidates.map((c) => ({
        c,
        haystack: `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase(),
      })),
    [candidates],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return indexed.slice(0, MAX_RESULTS).map((x) => x.c);
    // Multi-token AND: every whitespace-separated token must appear somewhere
    // in the haystack. Lets you type "barry ccpd" or "kent daily" naturally.
    const tokens = q.split(/\s+/);
    const matched: Option[] = [];
    for (const { c, haystack } of indexed) {
      if (tokens.every((t) => haystack.includes(t))) {
        matched.push(c);
        if (matched.length >= MAX_RESULTS) break;
      }
    }
    return matched;
  }, [query, indexed]);

  // Keep highlight inside results bounds when results shrink.
  useEffect(() => {
    if (highlight >= results.length) setHighlight(0);
  }, [results.length, highlight]);

  // Click-outside to close.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Scroll highlighted item into view.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLLIElement>(
      `[data-idx="${highlight}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function pick(opt: Option) {
    setSelected(opt);
    setQuery(`${opt.firstName} ${opt.lastName} (${opt.email})`);
    setOpen(false);
  }

  function clearSelection() {
    setSelected(null);
    setQuery("");
    setHighlight(0);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[highlight]) {
        e.preventDefault();
        pick(results[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No more candidates to add.{" "}
        <a href="/candidates/new" className="underline">
          Create one
        </a>
        .
      </p>
    );
  }

  return (
    <form
      action={() => {
        if (!selected) return;
        startTransition(async () => {
          await addCandidateToJob(jobId, selected.id);
          // Reset so user can immediately add another.
          setSelected(null);
          setQuery("");
          router.refresh();
        });
      }}
      className="flex items-start gap-2"
    >
      <div ref={containerRef} className="relative flex-1 min-w-72 max-w-md">
        <input
          ref={inputRef}
          type="text"
          name="candidateQuery"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Search candidates by name or email…"
          onChange={(e) => {
            setQuery(e.target.value);
            // Typing invalidates any current selection.
            if (selected) setSelected(null);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="add-candidate-listbox"
          role="combobox"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
        />
        {selected && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selection"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-sm leading-none"
          >
            ×
          </button>
        )}

        {open && (
          <ul
            ref={listRef}
            id="add-candidate-listbox"
            role="listbox"
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg"
          >
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-zinc-500">No matches.</li>
            ) : (
              results.map((c, i) => {
                const label = `${c.firstName} ${c.lastName}`;
                const isHi = i === highlight;
                return (
                  <li
                    key={c.id}
                    data-idx={i}
                    role="option"
                    aria-selected={isHi}
                    onMouseDown={(e) => {
                      // mousedown (not click) so the blur from input doesn't close the list first.
                      e.preventDefault();
                      pick(c);
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      isHi
                        ? "bg-zinc-100 dark:bg-zinc-800"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                    }`}
                  >
                    <div className="font-medium">
                      <Highlight text={label} query={query} />
                    </div>
                    <div className="text-xs text-zinc-500">
                      <Highlight text={c.email} query={query} />
                    </div>
                  </li>
                );
              })
            )}
            {query.trim() === "" && candidates.length > MAX_RESULTS && (
              <li className="px-3 py-2 text-xs text-zinc-500 border-t border-zinc-200 dark:border-zinc-800">
                Showing first {MAX_RESULTS} of {candidates.length}. Keep typing to narrow.
              </li>
            )}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={pending || !selected}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

/**
 * Bold the first matching substring (case-insensitive) of `query` inside `text`.
 * For multi-token queries we just highlight the longest token that matches —
 * keeps the markup simple without rendering nested spans for each token.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const tokens = q.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
  const lower = text.toLowerCase();
  for (const t of tokens) {
    const idx = lower.indexOf(t.toLowerCase());
    if (idx >= 0) {
      return (
        <>
          {text.slice(0, idx)}
          <span className="font-semibold underline decoration-zinc-400 underline-offset-2">
            {text.slice(idx, idx + t.length)}
          </span>
          {text.slice(idx + t.length)}
        </>
      );
    }
  }
  return <>{text}</>;
}
