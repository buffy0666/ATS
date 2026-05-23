"use client";

import { useRef, useState, useTransition } from "react";
import { addKnowledgeItem } from "./actions";

type ItemType = "document" | "link";

export function KnowledgeForm() {
  const [type, setType] = useState<ItemType>("document");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        startTransition(async () => {
          await addKnowledgeItem(fd);
          formRef.current?.reset();
          setType("document");
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Name *</label>
          <input
            type="text"
            name="name"
            required
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            placeholder="Q4 Hiring Plan"
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Type *</label>
          <select
            name="type"
            required
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="document">Document (Upload)</option>
            <option value="link">Link</option>
          </select>
        </div>
      </div>

      {type === "link" ? (
        <div>
          <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">URL / Link</label>
          <input
            type="url"
            name="url"
            required
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            placeholder="https://..."
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-1">Upload Document</label>
          <input
            type="file"
            name="file"
            required
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700"
          />
          <p className="text-xs text-zinc-500 mt-1">PDF, DOCX, XLSX, TXT up to 20MB</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-black dark:bg-white text-white dark:text-black px-5 py-2 text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add to Knowledge Base"}
      </button>
    </form>
  );
}
