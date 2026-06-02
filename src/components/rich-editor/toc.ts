/**
 * Quick Jump (table-of-contents) helpers. Portable — no app imports.
 *
 * The editor stores plain HTML. To power a "Quick Jump" sidebar we derive the
 * heading outline from that HTML and ensure every heading carries a stable id
 * that anchor links can target. We build this ourselves (rather than the paid-
 * history Tiptap ToC extension) so it works identically in the read-only
 * viewer and stays dependency-free.
 */

export type TocEntry = {
  id: string;
  level: number; // 1-4
  text: string;
};

function slugify(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "section";
  let slug = base;
  let n = 1;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

/**
 * Ensure every h1-h4 in the HTML has an id. Returns the (possibly modified)
 * HTML plus the extracted outline. Runs in the browser (uses DOMParser) and is
 * a no-op string passthrough on the server (where document is unavailable) —
 * callers that need ids server-side should persist the output of this.
 */
export function withHeadingIds(html: string): { html: string; toc: TocEntry[] } {
  if (!html || typeof window === "undefined" || typeof DOMParser === "undefined") {
    return { html: html ?? "", toc: [] };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const used = new Set<string>();
  const toc: TocEntry[] = [];
  doc.querySelectorAll("h1, h2, h3, h4").forEach((el) => {
    const level = Number(el.tagName.substring(1));
    const text = el.textContent?.trim() ?? "";
    if (!text) return;
    let id = el.getAttribute("id");
    if (!id) {
      id = slugify(text, used);
      el.setAttribute("id", id);
    } else {
      used.add(id);
    }
    toc.push({ id, level, text });
  });
  return { html: doc.body.innerHTML, toc };
}

/** Extract the outline only, without mutating the HTML. */
export function extractToc(html: string): TocEntry[] {
  return withHeadingIds(html).toc;
}
