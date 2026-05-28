"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Friendly file picker: a large dashed-border area the user can either
 * drag a file onto OR click to open the native picker. Used by both
 * import flows (template + mapping) so the affordance is consistent.
 *
 * Controlled: the parent owns `file`. When `name` is provided we also
 * render a hidden <input type="file" name=…> and sync its `files` so
 * the dropzone works inside a plain `<form action={serverAction}>` and
 * FormData picks the file up under that name.
 */
export function FileDropzone({
  file,
  onFileChange,
  accept = ".csv,text/csv",
  name,
  id,
  disabled = false,
  // Optional hint shown under the prompt — e.g. "Max 5 MB".
  hint,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  name?: string;
  id?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Keep the hidden <input>'s FileList in sync with the controlled `file`
  // so server-action forms that read FormData by `name` see the right
  // file after a drag-drop (which bypasses the input's own change event).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
    } else {
      el.value = "";
    }
  }, [file]);

  function openPicker() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    onFileChange(f);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0] ?? null;
    onFileChange(f);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer"
        } ${
          dragging
            ? "border-emerald-500 bg-emerald-50 dark:border-emerald-400 dark:bg-emerald-950/30"
            : file
              ? "border-emerald-400 bg-emerald-50/40 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30"
              : "border-zinc-300 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        }`}
      >
        {file ? (
          <>
            <div className="text-2xl" aria-hidden="true">📄</div>
            <div className="font-medium break-all">{file.name}</div>
            <div className="text-xs text-zinc-500">{humanSize(file.size)}</div>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  openPicker();
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
              >
                Replace
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onFileChange(null);
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-3xl" aria-hidden="true">⬆️</div>
            <div className="font-medium">
              Drag a CSV file here, or{" "}
              <span className="text-emerald-700 underline dark:text-emerald-400">
                click to choose
              </span>
            </div>
            <div className="text-xs text-zinc-500">{hint ?? "CSV files only"}</div>
          </>
        )}
      </div>

      {/* Hidden real file input — sync'd above so <form action=…> works. */}
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="file"
        accept={accept}
        onChange={onPick}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
