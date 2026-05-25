// Content script that runs on every linkedin.com/in/* page.
//
// Strategy:
//  1. Reliably scrape just the two things that LinkedIn can't break:
//     the canonical profile URL and the candidate's name.
//  2. Grab the full visible text of the page (document.body.innerText).
//  3. Send both to the background worker, which POSTs to the ATS. The
//     ATS-side AI parser sifts the page text for structured fields.
//
// Doing it this way means the extension survives LinkedIn redesigns —
// we don't depend on obfuscated CSS classes or specific DOM positions.

(function () {
  "use strict";

  // -------------------------------------------------------------------------
  // One-shot guard: LinkedIn navigations are client-side (SPA), so this
  // script runs once at first load. Use a small MutationObserver to re-inject
  // the button when the user navigates between profiles.
  // -------------------------------------------------------------------------
  const BUTTON_ID = "ats-add-button";
  const TOAST_ID = "ats-toast";

  function isProfilePage() {
    return /^\/in\/[^/]+\/?$/.test(window.location.pathname);
  }

  function injectButton() {
    if (!isProfilePage()) return;
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "+ Add to ATS";
    btn.title = "Capture this profile into the ATS";
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
  }

  /**
   * Pull the candidate's name from the most stable sources LinkedIn exposes.
   * In order of preference:
   *   1. <h1> inside the main profile card — present on the live profile page.
   *   2. <title> tag — "Firstname Lastname | LinkedIn"-ish format.
   *   3. The URL slug as a last-ditch fallback (e.g. /in/jane-smith-1234).
   *
   * Returns { firstName, lastName } — best effort to split a single string
   * on the first space.
   */
  function scrapeName() {
    // Try h1 first — usually the cleanest source.
    const h1 = document.querySelector("main h1, h1");
    let raw = h1 ? h1.textContent.trim() : "";

    // Fall back to the <title>.
    if (!raw && document.title) {
      // Common LinkedIn formats:
      //   "(N) Firstname Lastname | LinkedIn"
      //   "Firstname Lastname | LinkedIn"
      //   "Firstname Lastname – ... | LinkedIn"
      const stripped = document.title
        .replace(/^\(\d+\)\s*/, "")
        .split(/\s*[|–-]\s*LinkedIn/i)[0]
        .trim();
      if (stripped && !/^linkedin/i.test(stripped)) raw = stripped;
    }

    // Slug fallback: /in/jane-smith-1234 → "Jane Smith"
    if (!raw) {
      const slugMatch = window.location.pathname.match(/^\/in\/([^/]+)/);
      if (slugMatch) {
        raw = slugMatch[1]
          .replace(/-\d+\w*$/, "")            // drop trailing -id segment
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim();
      }
    }

    if (!raw) return { firstName: "", lastName: "" };

    // Strip honorifics + post-nominal letters (Dr., MBA, PhD, etc.) so the
    // ATS doesn't end up with names like "Dr. Jane Smith, MBA".
    raw = raw
      .replace(/,.*$/, "")  // drop everything after the first comma
      .replace(/\([^)]*\)/g, "")  // drop parentheticals
      .trim();

    const parts = raw.split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0], lastName: "" };
    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
    };
  }

  /**
   * Canonical profile URL. window.location.href works, but we strip the
   * query string + trailing slash so two clicks on the same profile (one
   * from search, one direct) dedupe in the ATS by URL.
   */
  function canonicalUrl() {
    const u = new URL(window.location.href);
    u.search = "";
    u.hash = "";
    let str = u.toString();
    if (str.endsWith("/")) str = str.slice(0, -1);
    return str;
  }

  /**
   * Grab the visible page text. Caps at ~80KB to keep payloads sane (the
   * server further trims to 40KB for AI parsing — anything past that is
   * almost certainly noise like activity feeds).
   */
  function scrapePageText() {
    // Prefer the main profile section if we can find it; falls back to body.
    const main = document.querySelector("main") || document.body;
    const text = (main.innerText || "").replace(/ /g, " ");
    // Compress runs of blank lines so we send less padding.
    const cleaned = text
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    return cleaned.slice(0, 80_000);
  }

  async function onClick(event) {
    const btn = event.currentTarget;
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";

    const previous = btn.textContent;
    btn.textContent = "Saving…";
    btn.disabled = true;

    try {
      const { firstName, lastName } = scrapeName();
      const linkedinUrl = canonicalUrl();
      const pageText = scrapePageText();

      if (!firstName) {
        toast("Couldn't find a name on this page. Open the profile fully first.", "error");
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "ats:add-candidate",
        payload: {
          firstName,
          lastName,
          linkedinUrl,
          pageText,
          source: "LinkedIn (Chrome extension)",
        },
      });

      if (!response) {
        toast("No response from the extension background worker. Reload the page.", "error");
        return;
      }
      if (response.ok && response.status === "created") {
        toast(
          `Added ${firstName} ${lastName}. Click to open in ATS.`,
          "success",
          response.candidateUrl,
        );
      } else if (response.ok && response.status === "exists") {
        toast(
          `Already in ATS as ${response.candidate.firstName} ${response.candidate.lastName}. Click to open.`,
          "info",
          response.candidate.url,
        );
      } else {
        toast(response.error ?? "Couldn't save the candidate.", "error");
      }
    } catch (err) {
      toast(
        "Extension error: " + (err && err.message ? err.message : "unknown"),
        "error",
      );
    } finally {
      btn.textContent = previous;
      btn.disabled = false;
      btn.dataset.busy = "0";
    }
  }

  /**
   * Lightweight toast pinned bottom-right. If `linkUrl` is provided, clicking
   * the toast opens that URL — used to jump straight from "saved" to the
   * candidate's page in the ATS.
   */
  function toast(message, kind, linkUrl) {
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = TOAST_ID;
    el.className = `ats-toast ats-toast--${kind || "info"}`;
    el.textContent = message;
    if (linkUrl) {
      el.style.cursor = "pointer";
      el.title = "Click to open in ATS";
      el.addEventListener("click", () => window.open(linkUrl, "_blank"));
    }
    document.body.appendChild(el);

    // Auto-dismiss errors after 8s, success/info after 5s.
    const ttl = kind === "error" ? 8000 : 5000;
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, ttl);
  }

  // Initial inject + watch for SPA navigations (LinkedIn replaces the main
  // content without firing a full page load when you navigate between
  // profiles).
  injectButton();
  let lastPath = window.location.pathname;
  const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      // Give LinkedIn a moment to render the new profile before we look at it.
      setTimeout(injectButton, 600);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
