"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeHtml } from "./sanitize";
import { withHeadingIds, type TocEntry } from "./toc";

/**
 * Read-only renderer for rich-editor HTML. Portable React/Tailwind component:
 * the only inputs are an HTML string and display options — no app types.
 *
 * Used in two places:
 *   - The knowledge article home view (compact, ~1/3 height, scrollable).
 *   - Inside the pop-out modal's reading mode.
 *
 * Always sanitizes before rendering (defense in depth — content is also
 * sanitized on write).
 */
export function RichViewer({
  html,
  showQuickJump = false,
  maxHeight,
  className,
}: {
  html: string | null | undefined;
  /** Render the Quick Jump (TOC) sidebar on the left. */
  showQuickJump?: boolean;
  /** Cap the content height and scroll inside (e.g. "20rem" for the home view). */
  maxHeight?: string;
  className?: string;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);

  // Sanitize, then inject heading ids so Quick Jump anchors resolve.
  const processed = useMemo(() => {
    const clean = sanitizeHtml(html);
    if (!showQuickJump) return { html: clean, toc: [] as TocEntry[] };
    return withHeadingIds(clean);
  }, [html, showQuickJump]);

  useEffect(() => {
    setToc(processed.toc);
  }, [processed.toc]);

  function jumpTo(id: string) {
    const root = bodyRef.current;
    if (!root) return;
    const target = root.querySelector(`#${CSS.escape(id)}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const isEmpty = !processed.html || processed.html.trim() === "" || processed.html === "<p></p>";

  if (isEmpty) {
    return <p className="text-sm text-zinc-400">No content yet.</p>;
  }

  return (
    <div className={`flex gap-4 ${className ?? ""}`}>
      {showQuickJump && toc.length > 0 && (
        <nav
          aria-label="Quick jump"
          className="hidden sm:block w-48 shrink-0 overflow-y-auto pr-2"
          style={maxHeight ? { maxHeight } : undefined}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">
            Quick jump
          </div>
          <ul className="space-y-0.5 text-sm">
            {toc.map((t) => (
              <li key={t.id} style={{ paddingLeft: `${(t.level - 1) * 10}px` }}>
                <button
                  type="button"
                  onClick={() => jumpTo(t.id)}
                  className="block w-full truncate text-left text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:underline"
                  title={t.text}
                >
                  {t.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div
        ref={bodyRef}
        className="rich-content min-w-0 flex-1 overflow-y-auto"
        style={maxHeight ? { maxHeight } : undefined}
        dangerouslySetInnerHTML={{ __html: processed.html }}
      />
    </div>
  );
}
