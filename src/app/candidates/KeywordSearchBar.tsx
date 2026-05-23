"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function KeywordSearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initialQ);
  const [showHelp, setShowHelp] = useState(false);

  // Keep local state in sync if the URL changes externally (e.g. user clicks
  // a saved search).
  useEffect(() => {
    setValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  // Debounce so we don't navigate on every keystroke.
  useEffect(() => {
    if (value === (searchParams.get("q") ?? "")) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      const trimmed = value.trim();
      if (trimmed) next.set("q", trimmed);
      else next.delete("q");
      router.push(`/candidates${next.toString() ? `?${next.toString()}` : ""}`, {
        scroll: false,
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative flex-1 min-w-60">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Boolean search: "react" AND ("typescript" OR "next.js") -junior'
        className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 pr-9 text-sm"
        spellCheck={false}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShowHelp((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        aria-label="Search syntax help"
        title="Search syntax help"
      >
        ?
      </button>
      {showHelp && (
        <div
          className="absolute right-0 z-30 mt-1 w-80 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-3 text-xs text-zinc-700 dark:text-zinc-300"
          onMouseLeave={() => setShowHelp(false)}
        >
          <div className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">Search syntax</div>
          <ul className="space-y-1 list-disc list-inside">
            <li>
              <code>AND</code>, <code>OR</code>, <code>NOT</code> (case-insensitive)
            </li>
            <li>
              Parentheses for grouping: <code>(react OR vue)</code>
            </li>
            <li>
              Phrases in quotes: <code>&quot;machine learning&quot;</code>
            </li>
            <li>
              Leading <code>-</code> for NOT: <code>-junior</code>
            </li>
            <li>Adjacent terms are AND-ed</li>
          </ul>
          <div className="mt-2 text-[11px] text-zinc-500">
            Searches name, email, title, company, summary, skills, industries,
            specialties, notes, and resume text.
          </div>
        </div>
      )}
    </div>
  );
}
