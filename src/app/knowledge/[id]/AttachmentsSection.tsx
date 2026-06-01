"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addKnowledgeAttachments, deleteKnowledgeAttachment } from "../actions";

export type AttachmentRow = {
  id: string;
  name: string;
  url: string;
  size: number;
  mimeType: string | null;
  uploadedAt: Date;
  uploadedBy: { name: string | null; email: string } | null;
};

export function AttachmentsSection({
  itemId,
  attachments,
  canModify,
}: {
  itemId: string;
  attachments: AttachmentRow[];
  canModify: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await addKnowledgeAttachments(itemId, formData);
      if (res.ok) {
        formRef.current?.reset();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleDelete(attachmentId: string, name: string) {
    if (!confirm(`Remove "${name}"? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteKnowledgeAttachment(attachmentId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Documents ({attachments.length})
        </h2>
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-zinc-500">No documents attached yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline break-all"
                >
                  {a.name}
                </a>
                <div className="text-xs text-zinc-500">
                  {formatBytes(a.size)}
                  {a.uploadedBy && (
                    <> · {a.uploadedBy.name ?? a.uploadedBy.email}</>
                  )}
                  {" · "}
                  {new Date(a.uploadedAt).toLocaleDateString()}
                </div>
              </div>
              {canModify && (
                <button
                  type="button"
                  onClick={() => handleDelete(a.id, a.name)}
                  disabled={pending}
                  className="shrink-0 rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canModify && (
        <form ref={formRef} action={handleAdd} className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="add-files">
            Add documents
          </label>
          <input
            id="add-files"
            type="file"
            name="file"
            multiple
            disabled={pending}
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Uploading…" : "Upload"}
            </button>
            <span className="text-xs text-zinc-500">
              PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, or images (PNG/JPG/GIF/WebP) up to 20MB each.
            </span>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
