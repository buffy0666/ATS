"use client";

import { useEffect, useRef, useState } from "react";

export function Composer({
  pending,
  onSubmit,
  onStop,
}: {
  pending: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize up to ~5 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 5 * 20 + 16; // ~5 lines @ 20px line height + padding
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [value]);

  function submit() {
    const text = value.trim();
    if (!text || pending) return;
    onSubmit(text);
    setValue("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-3">
      <div className="flex items-end gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 focus-within:ring-2 focus-within:ring-zinc-300 dark:focus-within:ring-zinc-700">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask the assistant…"
          className="flex-1 resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-zinc-400"
          disabled={pending && false /* keep typing while it streams */}
        />
        {pending ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
      <p className="mt-1 text-[10px] text-zinc-400 px-1">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
