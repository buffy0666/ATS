"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KnowledgeStatus } from "@/generated/prisma";
import { addKnowledgeItem, uploadKnowledgeImageDraft } from "./actions";
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_TYPES } from "./constants";
import { RichEditor } from "@/components/rich-editor/RichEditor";

export function KnowledgeForm({
  isAdmin,
  clients = [],
  lockedClient = null,
  defaultCategory,
}: {
  isAdmin: boolean;
  /** Selectable clients for the global KB form. */
  clients?: { id: string; name: string }[];
  /** When launched from a client page, the client is fixed (shown read-only). */
  lockedClient?: { id: string; name: string } | null;
  /** Preselect a category (e.g. when adding a SOP from a section view). */
  defaultCategory?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Rich article body (sanitized HTML) authored inline on this form.
  const [content, setContent] = useState("");
  // Managed file list so picks accumulate (the native multiple input replaces
  // its selection on each click). Each pick appends; users can remove any.
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const f of Array.from(picked)) {
        // De-dupe by name+size so re-picking the same file doesn't double it.
        if (!next.some((e) => e.name === f.name && e.size === f.size)) {
          next.push(f);
        }
      }
      return next;
    });
    // Reset the input so picking the same filename again still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Host-supplied image uploader for the article editor. On the create form
  // there's no item yet, so we use the draft uploader (just stores the blob and
  // returns its URL to embed in the content).
  async function uploadImage(file: File): Promise<{ url: string }> {
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadKnowledgeImageDraft(fd);
    if (!res.ok) throw new Error(res.error);
    return { url: res.url };
  }

  return (
    <form
      action={(fd) => {
        setError(null);
        // The file input carries no name; append the managed list under
        // "file" so the server action's getAll("file") sees every pick.
        for (const f of files) fd.append("file", f);
        // The article body lives in React state (RichEditor), not a form
        // field — append it so the action persists it on create.
        fd.set("content", content);
        startTransition(async () => {
          try {
            const res = await addKnowledgeItem(fd);
            if (res.ok) {
              // Land on the new article so the saved content is right there.
              router.push(`/knowledge/${res.id}`);
              router.refresh();
            } else {
              setError(res.error);
            }
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

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="category">
            Category *
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue={defaultCategory ?? KNOWLEDGE_CATEGORIES[0]}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="clientId">
            Client
          </label>
          {lockedClient ? (
            <>
              <input type="hidden" name="clientId" value={lockedClient.id} />
              <div className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                {lockedClient.name}
              </div>
            </>
          ) : (
            <select
              id="clientId"
              name="clientId"
              defaultValue=""
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              <option value="">— No client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="description">
          Brief Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          maxLength={2000}
          placeholder="One or two lines — what is this and when to use it?"
          className="w-full resize-y rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Article <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <RichEditor
          value={content}
          onChange={setContent}
          onUploadImage={uploadImage}
          placeholder="Write the full article — use the toolbar for formatting, paste images, embed YouTube…"
        />
        <p className="text-xs text-zinc-500 mt-1">
          Rich content with headings, images, links and video. You can keep editing it
          from the article page after saving.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="url">
          URL / Link <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <input
          id="url"
          type="url"
          name="url"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          placeholder="https://..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="file">
          Upload Documents <span className="font-normal text-zinc-400">(optional)</span>
        </label>

        {files.length > 0 && (
          <ul className="mb-2 divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${f.size}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm">{f.name}</div>
                  <div className="text-xs text-zinc-500">{formatBytes(f.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={pending}
                  className="shrink-0 rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          ref={fileInputRef}
          id="file"
          type="file"
          multiple
          onChange={(e) => addFiles(e.target.files)}
          className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700"
        />
        <p className="text-xs text-zinc-500 mt-1">
          {files.length > 0
            ? `${files.length} file${files.length === 1 ? "" : "s"} ready. Choose more to add to the list.`
            : "PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, ZIP, or images (PNG/JPG/GIF/WebP) up to 20MB each."}{" "}
          You can also add or remove files later from the item&apos;s page.
        </p>
      </div>

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
