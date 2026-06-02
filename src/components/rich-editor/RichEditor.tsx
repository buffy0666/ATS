"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { useEffect } from "react";
import { buildExtensions } from "./extensions";
import { Toolbar } from "./Toolbar";
import { sanitizeHtml } from "./sanitize";

/**
 * The full WYSIWYG rich editor. Portable React/Tailwind component.
 *
 * Contract (intentionally generic — no app types so this drops into the future
 * Wiki or any React tool):
 *   - value:       HTML string in
 *   - onChange:    HTML string out (already sanitized)
 *   - onUploadImage: host-supplied uploader. The editor calls it on image
 *                  insert/paste; the host decides where bytes go (Vercel Blob
 *                  here, something else elsewhere). Omit to hide image upload.
 *
 * No Tiptap Cloud, no license key, no network calls to Tiptap — only MIT OSS
 * extensions are used.
 */
export function RichEditor({
  value,
  onChange,
  onUploadImage,
  placeholder,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  onUploadImage?: (file: File) => Promise<{ url: string }>;
  placeholder?: string;
  className?: string;
}) {
  const editor = useEditor({
    extensions: buildExtensions({ placeholder }),
    content: value || "",
    immediatelyRender: false, // required for Next.js SSR
    editorProps: {
      attributes: {
        class: "rich-content focus:outline-none min-h-[40vh] px-4 py-3",
      },
      // Intercept pasted/dropped image files → route through the host uploader.
      handlePaste(view, event) {
        if (!onUploadImage) return false;
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadAndInsert(files);
        return true;
      },
      handleDrop(view, event) {
        if (!onUploadImage) return false;
        const dt = (event as DragEvent).dataTransfer;
        const files = Array.from(dt?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadAndInsert(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      // Sanitize on the way out so persisted content is always clean.
      onChange(sanitizeHtml(editor.getHTML()));
    },
  });

  async function uploadAndInsert(files: File[]) {
    if (!editor || !onUploadImage) return;
    for (const file of files) {
      try {
        const { url } = await onUploadImage(file);
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : "Image upload failed.");
      }
    }
  }

  // Keep the editor in sync if the parent swaps `value` (e.g. after a reset).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && value !== undefined) {
      // Tiptap v2: setContent(content, emitUpdate?, parseOptions?). Pass false
      // so syncing external value changes doesn't trigger onUpdate.
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div
      className={`flex flex-col rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-hidden ${className ?? ""}`}
    >
      <Toolbar editor={editor} onUploadImage={onUploadImage} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
