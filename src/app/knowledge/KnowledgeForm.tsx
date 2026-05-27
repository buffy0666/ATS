"use client";

import { useState, useTransition } from "react";
import { KnowledgeStatus } from "@/generated/prisma";
import { addKnowledgeItem } from "./actions";
import { KNOWLEDGE_TYPES } from "./constants";

type Source = "document" | "link";

export function KnowledgeForm({ isAdmin }: { isAdmin: boolean }) {
  const [source, setSource] = useState<Source>("document");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          try {
            await addKnowledgeItem(fd);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save knowledge item.");
          }
        });
      }}
      className="space-y-5"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">
            Name *
          </label>
          <input
            id="name"
            type="text"
            name="name"
            required
            maxLength={160}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            placeholder="Q4 Hiring Plan"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="type">
            Type *
          </label>
          <select
            id="type"
            name="type"
            required
            defaultValue={KNOWLEDGE_TYPES[0]}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            {KNOWLEDGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="source">
          Source *
        </label>
        <select
          id="source"
          name="source"
          required
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm md:max-w-xs"
        >
          <option value="document">Upload a file</option>
          <option value="link">Link to a URL</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          placeholder="What is this — and when should someone use it?"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>

      {source === "link" ? (
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="url">
            URL / Link *
          </label>
          <input
            id="url"
            type="url"
            name="url"
            required
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            placeholder="https://..."
          />
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="file">
            Upload Document *
          </label>
          <input
            id="file"
            type="file"
            name="file"
            required
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700"
          />
          <p className="text-xs text-zinc-500 mt-1">PDF, DOC/DOCX, XLS/XLSX, TXT up to 20MB</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="status">
          Status
        </label>
        {isAdmin ? (
          <select
            id="status"
            name="status"
            defaultValue={KnowledgeStatus.UNDER_REVIEW}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value={KnowledgeStatus.UNDER_REVIEW}>Under Review</option>
            <option value={KnowledgeStatus.APPROVED}>Approved</option>
          </select>
        ) : (
          <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-500">
            Under Review (admins can approve later)
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to knowledge base"}
        </button>
        <a
          href="/knowledge"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
