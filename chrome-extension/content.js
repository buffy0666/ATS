// Content script that runs on every linkedin.com/in/* page.
//
// Strategy:
//  1. Reliably scrape just the two things that LinkedIn can't break:
//     the canonical profile URL and the candidate's name.
//  2. Force LinkedIn to render the lazy-loaded sections — Experience,
//     Education, Skills don't enter the DOM until they scroll into view,
//     so we programmatically scroll the whole page in chunks before
//     scraping. We also click any "see more" buttons inside those
//     sections so the AI gets the full bullet text instead of truncated
//     previews.
//  3. Scrape ONLY the sections we care about by anchoring on known h2
//     headers (About, Experience, Education, Skills, Licenses,
//     Certifications, Languages, Volunteering, Recommendations, Activity).
//     This excludes the right-rail "People you may know", "More profiles
//     for you", newsletters, footer, language picker, and messaging
//     overlay — all of which used to crowd out the actual profile
//     content in the AI's input.
//  4. Send the scoped text to the background worker, which POSTs to the
//     ATS. The ATS-side AI parser sifts the page text for structured
//     fields.
//
// Anchoring on header *text* rather than CSS classes means we survive
// LinkedIn redesigns — they rotate class names constantly but the
// section headers ("Experience", "Education", "Skills") have been stable
// for years.

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
    btn.title = "Capture this profile into the ATS · drag to move";
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
    makeDraggable(btn);
    restorePosition(btn);
  }

  // -------------------------------------------------------------------------
  // Draggable button.
  //
  // The button doubles as a drag handle: press and drag to reposition it
  // anywhere on screen, and the position is remembered (per browser, via
  // chrome.storage.local) across page loads and profiles. A small movement
  // threshold distinguishes a real drag from a normal click so dragging
  // never accidentally fires a capture.
  // -------------------------------------------------------------------------
  const POS_KEY = "atsBtnPos";
  const DRAG_THRESHOLD = 5; // px of movement before it counts as a drag

  // Position the button using left/top (overriding the CSS right/bottom),
  // clamped so it can never be dragged fully off-screen.
  function applyPosition(btn, left, top) {
    const w = btn.offsetWidth || 140;
    const h = btn.offsetHeight || 44;
    const maxLeft = Math.max(0, window.innerWidth - w);
    const maxTop = Math.max(0, window.innerHeight - h);
    const L = Math.min(Math.max(0, left), maxLeft);
    const T = Math.min(Math.max(0, top), maxTop);
    btn.style.setProperty("left", L + "px", "important");
    btn.style.setProperty("top", T + "px", "important");
    btn.style.setProperty("right", "auto", "important");
    btn.style.setProperty("bottom", "auto", "important");
  }

  function restorePosition(btn) {
    try {
      chrome.storage.local.get([POS_KEY], (res) => {
        const pos = res && res[POS_KEY];
        if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
          applyPosition(btn, pos.left, pos.top);
        }
      });
    } catch {
      /* storage unavailable — leave the default bottom-right position */
    }
  }

  function savePosition(left, top) {
    try {
      chrome.storage.local.set({ [POS_KEY]: { left, top } });
    } catch {
      /* ignore */
    }
  }

  function makeDraggable(btn) {
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let dragging = false;
    let moved = false;

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // left button / primary touch only
      dragging = true;
      moved = false;
      const rect = btn.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });

    btn.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      btn.dataset.dragging = "1";
      applyPosition(btn, originLeft + dx, originTop + dy);
    });

    function end(e) {
      if (!dragging) return;
      dragging = false;
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      delete btn.dataset.dragging;
      if (moved) {
        const rect = btn.getBoundingClientRect();
        savePosition(rect.left, rect.top);
        // The browser fires a click right after a drag-release on the same
        // element. Flag it so onClick() ignores that synthetic click and
        // doesn't kick off a capture. Cleared by onClick, or after a beat
        // in case no click is dispatched.
        btn.dataset.justDragged = "1";
        setTimeout(() => {
          if (btn.dataset.justDragged === "1") delete btn.dataset.justDragged;
        }, 400);
      }
    }

    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
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

  // -------------------------------------------------------------------------
  // Force lazy-loaded sections to render.
  //
  // LinkedIn ships profile sections behind IntersectionObservers — Experience,
  // Education, Skills, etc. don't exist in the DOM until they scroll into
  // view. If we scrape right when the user clicks the button, those sections
  // are completely missing and the AI never sees the candidate's career
  // history. So before scraping we scroll the whole page in chunks, wait a
  // beat between each scroll for LinkedIn's network calls and renders, and
  // then click any visible "see more" buttons inside profile sections so
  // bullets aren't truncated.
  // -------------------------------------------------------------------------

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function expandProfileSections() {
    const initialY = window.scrollY;

    // 1. Scroll through the page in ~10 steps. Each scroll fires
    //    IntersectionObservers for the next slab of sections.
    const docHeight = () =>
      Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
      );
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const target = Math.round((docHeight() * i) / steps);
      window.scrollTo({ top: target, behavior: "instant" });
      // 400ms is enough for the section to render + fetch any details.
      // Total budget: ~4s, which the user perceives as "Saving…".
      await sleep(400);
    }

    // 2. Click any "…see more" buttons inside profile sections so the
    //    AI sees full bullet text instead of LinkedIn's "show more" stub.
    //    LinkedIn marks these with aria-expanded="false". We match by
    //    button text to avoid clicking unrelated buttons (Connect,
    //    Follow, Send InMail, etc).
    const seeMoreButtons = document.querySelectorAll(
      'button[aria-expanded="false"], button.inline-show-more-text__button',
    );
    seeMoreButtons.forEach((btn) => {
      const label = (btn.textContent || btn.getAttribute("aria-label") || "")
        .trim()
        .toLowerCase();
      if (
        label.includes("see more") ||
        label.includes("show more") ||
        label.includes("…more") ||
        label.includes("...more")
      ) {
        try {
          btn.click();
        } catch {
          // Ignore — some buttons throw when clicked off-screen.
        }
      }
    });
    // Let any newly-expanded text settle.
    await sleep(400);

    // 3. Restore the user's scroll position so the page doesn't visibly
    //    jump after the "Saving…" toast.
    window.scrollTo({ top: initialY, behavior: "instant" });
  }

  // -------------------------------------------------------------------------
  // Scoped section scrape.
  //
  // Instead of grabbing the entire <main>.innerText — which sweeps in
  // "People you may know", "More profiles for you", newsletters, footer,
  // language picker, and the messaging overlay — we walk every <section>
  // and pick the ones whose h2 header matches a known profile section
  // ("Experience", "Education", "Skills", etc.). This keeps the AI's
  // input dramatically denser in actual candidate data.
  // -------------------------------------------------------------------------

  /**
   * Lowercase prefixes for the section headers we want to keep. Compared
   * with startsWith so "Skills (21)" still matches "skills".
   */
  const WANTED_SECTION_HEADERS = [
    "about",
    "featured",
    "activity",
    "experience",
    "education",
    "licenses",
    "certifications",
    "skills",
    "projects",
    "publications",
    "patents",
    "courses",
    "honors",
    "test scores",
    "languages",
    "organizations",
    "volunteering",
    "volunteer",
    "interests",
    "recommendations",
  ];

  /**
   * Headers we explicitly DROP even if they live inside <main>. LinkedIn
   * sometimes renders these as full <section> elements with h2 headers
   * inside the profile column.
   */
  const NOISE_SECTION_HEADERS = [
    "people you may know",
    "more profiles for you",
    "you might like",
    "newsletters for you",
    "promoted",
  ];

  function matchesPrefix(text, prefixes) {
    const t = (text || "").trim().toLowerCase();
    return prefixes.some((p) => t.startsWith(p));
  }

  /**
   * Scrape the profile header — name, headline, location, connection
   * count. Picks up everything inside the top-level <section> that wraps
   * the h1.
   */
  function scrapeHeader(main) {
    const h1 = main.querySelector("h1");
    if (!h1) return "";
    // Climb up to the nearest enclosing <section> (the profile card).
    const card = h1.closest("section") || h1.parentElement;
    return (card?.innerText || "").trim();
  }

  /**
   * Find a section by anchor id. LinkedIn uses stable ids on the section
   * containers (`#about`, `#experience`, `#education`, `#skills`, etc.) —
   * way more reliable than scraping h2 text, which can be hidden inside
   * nested spans / aria attributes / icons.
   *
   * The element with the id is usually an empty `<div>` placeholder right
   * above the actual section content; we walk up to find the enclosing
   * `<section>` (or settle for the parent element if not in a section).
   */
  function findSectionByAnchorId(main, anchorId) {
    const anchor = main.querySelector(`#${anchorId}`);
    if (!anchor) return null;
    const section = anchor.closest("section") || anchor.parentElement;
    return section || null;
  }

  /**
   * Walk every <section> child of <main> (LinkedIn nests profile cards
   * one section per topic). Combined with anchor-id lookups so we don't
   * miss sections whose h2 text is wrapped weirdly.
   */
  function scrapeWantedSections(main) {
    const kept = new Map(); // key → text, so dedupe is automatic

    // Pass 1: anchor IDs. These are LinkedIn's most stable hook.
    const anchorIds = [
      "about",
      "featured",
      "activity",
      "experience",
      "education",
      "licenses_and_certifications",
      "licenses-and-certifications",
      "certifications",
      "skills",
      "projects",
      "publications",
      "patents",
      "courses",
      "honors_and_awards",
      "honors-and-awards",
      "test_scores",
      "test-scores",
      "languages",
      "organizations",
      "volunteering_experience",
      "volunteer_experience",
      "volunteering",
      "interests",
      "recommendations",
    ];
    for (const id of anchorIds) {
      const section = findSectionByAnchorId(main, id);
      if (!section) continue;
      const text = (section.innerText || "").trim();
      if (text.length < 10) continue;
      const key = id.split(/[_-]/)[0]; // normalize for dedupe (skills/skills_endorsed)
      if (!kept.has(key)) kept.set(key, text);
    }

    // Pass 2: header text fallback. Catches sections that don't have an
    // anchor id (or where LinkedIn rotates the id naming).
    const sections = Array.from(main.querySelectorAll("section"));
    for (const section of sections) {
      const header =
        section.querySelector("h2")?.textContent ||
        section.querySelector("h3")?.textContent ||
        section.querySelector('[role="heading"]')?.textContent ||
        "";
      if (!header.trim()) continue;
      if (matchesPrefix(header, NOISE_SECTION_HEADERS)) continue;
      if (!matchesPrefix(header, WANTED_SECTION_HEADERS)) continue;
      const key = header.trim().toLowerCase().split(/\s+/)[0];
      if (kept.has(key)) continue;
      const text = (section.innerText || "").trim();
      if (text.length < 10) continue;
      kept.set(key, text);
    }

    return Array.from(kept.values());
  }

  /**
   * Threshold for the safety-net fallback. If our scoped scrape produces
   * less than this many characters, append the full main.innerText too —
   * better to send noisy text the AI can sift than to send a thin scrape
   * that's missing Experience/Education entirely.
   *
   * A typical complete LinkedIn profile (About + Activity + Experience +
   * Education + Skills) is 4-15KB of text. 2000 chars is well below the
   * "definitely captured the meat" line.
   */
  const MIN_SCRAPE_THRESHOLD = 2000;

  /**
   * Build the final string we send to the server. Caps at ~80KB to keep
   * payloads sane (the server further trims to 40KB for AI parsing —
   * anything past that is almost certainly noise).
   *
   * Assumes `expandProfileSections()` has already run.
   */
  function scrapePageText() {
    const main = document.querySelector("main") || document.body;
    const chunks = [];

    const header = scrapeHeader(main);
    if (header) chunks.push(header);

    const sections = scrapeWantedSections(main);
    chunks.push(...sections);

    // Diagnostic — visible in DevTools console when you click "Add to ATS".
    // Lets you (and us) see whether the scoped scrape actually grabbed
    // Experience/Education/etc. without having to look at the DB.
    const scopedLength = chunks.join("\n\n").length;
    console.log(
      `[ATS extension] Scoped scrape captured ${sections.length} sections, ${scopedLength} chars.`,
      sections.length > 0
        ? "Headers detected: " +
            sections
              .map((s) => s.split("\n")[0].slice(0, 40))
              .join(" | ")
        : "(no scoped sections found)",
    );

    // Safety net: if the scoped scrape is suspiciously thin (or empty),
    // append the full main body text. The AI parser handles noise OK —
    // missing data is the worse failure mode.
    if (scopedLength < MIN_SCRAPE_THRESHOLD) {
      const fallback = (main.innerText || "").trim();
      if (fallback) {
        chunks.push(
          `--- FULL PAGE FALLBACK (scoped scrape was thin) ---\n${fallback}`,
        );
        console.log(
          `[ATS extension] Scoped scrape was ${scopedLength} chars (< ${MIN_SCRAPE_THRESHOLD}), appending full body (${fallback.length} chars) as safety net.`,
        );
      }
    }

    const joined = chunks.join("\n\n");
    // Normalize whitespace: collapse runs of spaces within a line, drop
    // empty lines. LinkedIn sprinkles non-breaking spaces and stretches of
    // tabs through its markup; both become single spaces here.
    const cleaned = joined
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    const capped = cleaned.slice(0, 80_000);
    console.log(
      `[ATS extension] Final scrape: ${capped.length} chars sent to server.`,
    );
    return capped;
  }

  async function onClick(event) {
    const btn = event.currentTarget;
    // Ignore the synthetic click that follows a drag-to-move gesture.
    if (btn.dataset.justDragged === "1") {
      delete btn.dataset.justDragged;
      return;
    }
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";

    const previous = btn.textContent;
    btn.textContent = "Saving…";
    btn.disabled = true;

    try {
      const { firstName, lastName } = scrapeName();
      const linkedinUrl = canonicalUrl();

      if (!firstName) {
        toast("Couldn't find a name on this page. Open the profile fully first.", "error");
        return;
      }

      // Force LinkedIn to render Experience/Education/Skills before we
      // try to read them. Takes ~4 seconds for a typical profile.
      btn.textContent = "Reading profile…";
      await expandProfileSections();

      btn.textContent = "Saving…";
      const pageText = scrapePageText();

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

  // ---------------------------------------------------------------------
  // Robust injection.
  //
  // LinkedIn is a single-page app: it swaps profile content without a full
  // page load, and the URL can settle a beat AFTER the content script runs
  // at document_idle. A single injectButton() call therefore races the
  // render and often bails (isProfilePage() false, or body not ready yet),
  // leaving no button — the exact "button is missing" failure.
  //
  // Fix: poll for a few seconds after load and after every navigation, and
  // re-assert the button if LinkedIn's re-render ever drops it. The
  // injectButton() guard makes repeated calls cheap (it no-ops once the
  // button exists).
  // ---------------------------------------------------------------------

  function pollInject(durationMs = 6000, intervalMs = 700) {
    const deadline = Date.now() + durationMs;
    injectButton();
    const timer = setInterval(() => {
      injectButton();
      // Stop early once the button is in place AND we're past the first
      // second (covers the case where LinkedIn briefly removes it).
      if (Date.now() > deadline) clearInterval(timer);
    }, intervalMs);
  }

  // Initial inject (poll, because the profile may still be rendering).
  pollInject();

  // Watch for SPA navigations (LinkedIn replaces the main content without
  // firing a full page load when you navigate between profiles) AND for
  // LinkedIn re-renders that drop our button from the DOM.
  let lastPath = window.location.pathname;
  const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      // New profile — re-run the poll to catch the async render.
      pollInject();
    } else if (isProfilePage() && !document.getElementById(BUTTON_ID)) {
      // Same page, but LinkedIn removed our button — put it back.
      injectButton();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Belt-and-suspenders: the History API doesn't fire events on pushState,
  // so also re-check on popstate (back/forward) and a periodic heartbeat.
  window.addEventListener("popstate", () => pollInject(3000));
})();
