import DOMPurify from "dompurify";

/**
 * Sanitizes editor HTML before it is rendered to other users. The rich editor
 * stores raw HTML, and that content is shown to everyone in the org — so it
 * MUST be sanitized to prevent stored XSS.
 *
 * Portable: this module has no app-specific imports. It can be lifted into any
 * React/Tailwind project (the future Wiki, etc.) unchanged.
 *
 * We allow a conservative formatting + media set:
 *   - text formatting: b/strong, i/em, u, s, mark (highlight), code, pre
 *   - structure: p, h1-h4, ul/ol/li, blockquote, hr, br
 *   - links: a (href/title/target/rel)
 *   - images: img (src/alt/title/width/height)
 *   - YouTube embeds: iframe, but ONLY from youtube-nocookie.com / youtube.com
 *
 * iframes are normally an XSS vector, so we gate them with a hook that strips
 * any iframe whose src is not a YouTube embed URL.
 */

const ALLOWED_IFRAME_HOSTS = new Set([
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "www.youtube.com",
  "youtube.com",
]);

let hookInstalled = false;

function installIframeGuard(dom: typeof DOMPurify) {
  if (hookInstalled) return;
  hookInstalled = true;
  dom.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const el = node as Element;
    const src = el.getAttribute("src") || "";
    let ok = false;
    try {
      const url = new URL(src, "https://www.youtube-nocookie.com");
      ok = url.protocol === "https:" && ALLOWED_IFRAME_HOSTS.has(url.host);
    } catch {
      ok = false;
    }
    if (!ok) el.parentNode?.removeChild(el);
  });
}

const CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    "p", "br", "hr",
    "h1", "h2", "h3", "h4",
    "b", "strong", "i", "em", "u", "s", "mark", "code", "pre",
    "ul", "ol", "li",
    "blockquote",
    "a", "img",
    "iframe", // gated by the hook above
    "div", "span",
  ],
  ALLOWED_ATTR: [
    "href", "title", "target", "rel",
    "src", "alt", "width", "height",
    "class", "id",
    // iframe embed attrs (YouTube)
    "allow", "allowfullscreen", "frameborder",
    // editor heading anchor ids for the Quick Jump TOC
    "data-toc-id",
  ],
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitize a raw HTML string. Safe to call on the server or client.
 * Returns a string of clean HTML suitable for dangerouslySetInnerHTML.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  installIframeGuard(DOMPurify);
  return DOMPurify.sanitize(dirty, CONFIG) as unknown as string;
}
