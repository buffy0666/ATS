"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RichEditor } from "@/components/rich-editor/RichEditor";
import { RichViewer } from "@/components/rich-editor/RichViewer";
import { saveKnowledgeContent, uploadKnowledgeImage } from "../actions";

/**
 * The knowledge-article content section.
 *
 *  - Home view: a compact (~1/3 height) read-only viewer with a scroll bar.
 *  - "Pop out" opens a full-screen overlay with the Quick Jump sidebar and,
 *    for editors, the full WYSIWYG toolbar + Save.
 *
 * The portable rich-editor module does the heavy lifting; this file is the thin
 * ATS adapter that wires the server actions (save + image upload) into it.
 */
export function ContentSection({
  itemId,
  initialContent,
  canEdit,
}: {
  itemId: string;
  initialContent: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [draft, setDraft] = useState(initialContent);
  const [mode, setMode] = useState<"closed" | "read" | "edit">("closed");
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while the overlay is open + close on Escape (read mode).
  useEffect(() => {
    if (mode === "closed") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && mode === "read") setMode("closed");
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mode]);

  // Host-supplied image uploader the portable editor calls. Keeps the editor
  // decoupled from ATS storage.
  async function uploadImage(file: File): Promise<{ url: string }> {
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadKnowledgeImage(itemId, fd);
    if (!res.ok) throw new Error(res.error);
    return { url: res.url };
  }

  function openEdit() {
    setDraft(content);
    setError(null);
    setMode("edit");
  }

  function save() {
    setError(null);
    startSave(async () => {
      const res = await saveKnowledgeContent(itemId, draft);
      if (res.ok) {
        setContent(draft);
        setMode("closed");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Article
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("read")}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            ⤢ Pop out
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={openEdit}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 text-xs font-medium"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Compact home view — capped height, scrolls internally. */}
      <RichViewer html={content} maxHeight="22rem" />

      {/* Pop-out overlay */}
      {mode !== "closed" && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
            <h3 className="text-sm font-semibold">
              {mode === "edit" ? "Editing article" : "Article"}
            </h3>
            <div className="flex items-center gap-2">
              {mode === "read" && canEdit && (
                <button
                  type="button"
                  onClick={openEdit}
                  className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium"
                >
                  Edit
                </button>
              )}
              {mode === "edit" && (
                <>
                  {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("closed")}
                    disabled={saving}
                    className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                </>
              )}
              {mode === "read" && (
                <button
                  type="button"
                  onClick={() => setMode("closed")}
                  aria-label="Close"
                  className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden p-5">
            {mode === "edit" ? (
              <RichEditor
                value={draft}
                onChange={setDraft}
                onUploadImage={uploadImage}
                className="h-full"
                placeholder="Write the article — use the toolbar for formatting, paste images, embed YouTube…"
              />
            ) : (
              <RichViewer html={content} showQuickJump maxHeight="100%" className="h-full" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
