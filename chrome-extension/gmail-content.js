// Content script that runs on mail.google.com.
//
// Adds a floating "+ Add to ATS" button. When clicked while an email (or
// thread) is open, it reads the currently-expanded message(s) straight
// from Gmail's DOM and POSTs them — via the background worker — to the
// ATS /api/external/emails endpoint with source = "EXTENSION_GMAIL".
//
// This is the Gmail counterpart to the Outlook Add-in (public/outlook-addin),
// which uses the official Office.js mailbox API. Gmail has no equivalent
// in-page JS API for content scripts, so we scrape the DOM. We anchor on
// Gmail's obfuscated-but-decade-stable class hooks — the same ones every
// Gmail integration (Streak, Mixmax, GMass, …) has relied on for years:
//
//   h2.hP        — the conversation subject (one per open thread)
//   .adn         — one rendered message within the thread
//   span.gD[email]  — the sender (has `email` + `name` attributes)
//   span.g2[email]  — a recipient (To/Cc; present in the DOM even collapsed)
//   .a3s         — the message body
//   .g3[title]   — the sent date (localized string in the title attr)
//
// Capture model: "what you see is what's captured". Gmail auto-expands
// the latest message when you open a conversation, so that message is
// captured by default. Expand more messages in the thread to capture
// them too — only messages whose body is actually rendered are sent.

(function () {
  "use strict";

  const BUTTON_ID = "ats-gmail-add-button";
  const TOAST_ID = "ats-toast";
  const POS_KEY = "atsGmailBtnPos"; // separate from the LinkedIn button's

  // -------------------------------------------------------------------------
  // Reading the open conversation
  // -------------------------------------------------------------------------

  /**
   * The mailbox owner's address — used to decide direction (a message
   * FROM this address is OUTBOUND, otherwise INBOUND). Gmail surfaces it
   * on the Google Account button's aria-label, and in the tab title.
   */
  function getAccountEmail() {
    const labelled = document.querySelector(
      'a[aria-label*="Google Account"], [aria-label*="Google Account:"]',
    );
    if (labelled) {
      const m = (labelled.getAttribute("aria-label") || "").match(
        /\(([^()]+@[^()]+)\)/,
      );
      if (m) return m[1].trim().toLowerCase();
    }
    // Tab title fallback: "Inbox (3) - me@example.com - Gmail"
    const t = document.title.match(/[-–]\s*([^\s@]+@[^\s]+?)\s*[-–]\s*Gmail/);
    if (t) return t[1].trim().toLowerCase();
    return "";
  }

  function emailsFrom(nodes) {
    const out = [];
    nodes.forEach((n) => {
      const e = (n.getAttribute("email") || "").trim().toLowerCase();
      if (e) out.push(e);
    });
    return out;
  }

  /**
   * Parse the date from a message header. Gmail stores a full localized
   * date string in the `title` (or `alt`) attribute of the `.g3` span,
   * e.g. "Mon, Jun 9, 2026, 3:14 PM". Returns an ISO string or undefined
   * (the server falls back to "now" when the date is missing/unparseable).
   */
  function readSentAt(scope) {
    const el =
      scope.querySelector(".g3[title]") ||
      scope.querySelector(".g3[alt]") ||
      scope.querySelector("[data-tooltip].gH, .gH [title]");
    const raw = el
      ? el.getAttribute("title") || el.getAttribute("alt") || el.getAttribute("data-tooltip")
      : "";
    if (!raw) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  /**
   * Build the payload messages from every currently-rendered message body
   * in the open conversation. One {.a3s body} → one message. Collapsed
   * messages (no rendered body) are skipped so we don't send empty rows.
   */
  function collectMessages() {
    const myEmail = getAccountEmail();
    // Server caps the subject at 998 chars (the RFC 5322 line limit).
    const subject = (document.querySelector("h2.hP")?.textContent || "")
      .trim()
      .slice(0, 998);

    const bodies = Array.from(document.querySelectorAll(".a3s")).filter(
      (b) => (b.innerText || "").trim().length > 0,
    );

    const messages = [];
    const seenIds = new Set();

    for (const body of bodies) {
      // The message unit (.adn) scopes the header + body together.
      const scope = body.closest(".adn") || body.parentElement;
      if (!scope) continue;

      const fromEl =
        scope.querySelector("span.gD[email]") || scope.querySelector("span[email].gD");
      const fromAddr = (fromEl?.getAttribute("email") || "").trim().toLowerCase();
      if (!fromAddr) continue; // can't attribute this message — skip it

      const fromName = (fromEl?.getAttribute("name") || "").trim() || undefined;

      // Recipients: every .g2[email] in this message's header. We can't
      // reliably split To vs Cc from the DOM, so they all go in `to`
      // (the server's candidate-matching looks at to+cc together for
      // OUTBOUND, so this doesn't affect matching). Drop the sender if
      // they appear in their own recipient list.
      let to = Array.from(
        new Set(emailsFrom(scope.querySelectorAll("span.g2[email]"))),
      ).filter((a) => a !== fromAddr);

      const direction = myEmail && fromAddr === myEmail ? "OUTBOUND" : "INBOUND";

      // `to` must be non-empty for the server. Fall back to the mailbox
      // owner (for an INBOUND mail with unparsed recipients) or, last
      // resort, the sender — so a valid candidate match is still possible.
      if (to.length === 0) to = myEmail ? [myEmail] : [fromAddr];
      // Server caps recipients at 50; a big distribution list would 422.
      if (to.length > 50) to = to.slice(0, 50);

      // Stable per-message dedupe key. Gmail hangs data-message-id /
      // data-legacy-message-id off the message body wrapper.
      const idEl = body.closest("[data-message-id], [data-legacy-message-id]");
      const messageId =
        idEl?.getAttribute("data-message-id") ||
        idEl?.getAttribute("data-legacy-message-id") ||
        undefined;
      if (messageId) {
        if (seenIds.has(messageId)) continue;
        seenIds.add(messageId);
      }

      messages.push({
        messageId,
        from: fromAddr,
        fromName,
        to,
        cc: [],
        bcc: [],
        subject: subject || "(no subject)",
        sentAt: readSentAt(scope),
        bodyText: (body.innerText || "").slice(0, 100000),
        direction,
      });
    }

    return messages;
  }

  // -------------------------------------------------------------------------
  // Capture
  // -------------------------------------------------------------------------

  async function runCapture(btn, createIfMissing) {
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    const previous = btn.textContent;
    btn.textContent = createIfMissing ? "Creating…" : "Saving…";
    btn.disabled = true;

    try {
      const messages = collectMessages();
      if (!messages.length) {
        toast("Open an email first — couldn't read a message on this page.", "error");
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "ats:add-emails",
        payload: {
          source: "EXTENSION_GMAIL",
          messages,
          createCandidateIfMissing: createIfMissing,
        },
      });

      if (!response) {
        toast("No response from the extension background worker. Reload the page.", "error");
        return;
      }
      if (!response.ok) {
        toast(response.error || "Couldn't capture the email.", "error");
        return;
      }

      if (response.status === "captured") {
        const c = response.candidate;
        const name = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email;
        const skipped = response.skipped
          ? ` (${response.skipped} already on file)`
          : "";
        const verb = response.createdCandidate ? "Created & captured" : "Captured";
        toast(`${verb} for ${name}${skipped}. Click to open in ATS.`, "success", c.url);
        return;
      }

      if (response.status === "no-candidate-matched") {
        const u = response.unmatched;
        if (u && u.email) {
          toast(
            `No candidate yet for ${u.email}. Click to create one & save this email.`,
            "info",
            null,
            () => runCapture(btn, true),
          );
        } else {
          toast("Couldn't determine the other party in this email.", "error");
        }
        return;
      }

      toast("Unexpected response from the ATS.", "error");
    } catch (err) {
      toast("Extension error: " + (err && err.message ? err.message : "unknown"), "error");
    } finally {
      btn.textContent = previous;
      btn.disabled = false;
      btn.dataset.busy = "0";
    }
  }

  // -------------------------------------------------------------------------
  // Toast — pinned bottom-right. Optional link (opens a URL on click) or
  // an action callback (e.g. "create candidate & save").
  // -------------------------------------------------------------------------

  function toast(message, kind, linkUrl, onClick) {
    const existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    const el = document.createElement("div");
    el.id = TOAST_ID;
    el.className = `ats-toast ats-toast--${kind || "info"}`;
    el.textContent = message;
    const handler = onClick || (linkUrl ? () => window.open(linkUrl, "_blank") : null);
    if (handler) {
      el.style.cursor = "pointer";
      el.title = onClick ? "Click to continue" : "Click to open in ATS";
      el.addEventListener("click", () => {
        el.remove();
        handler();
      });
    }
    document.body.appendChild(el);

    const ttl = kind === "error" ? 8000 : kind === "info" ? 10000 : 5000;
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, ttl);
  }

  // -------------------------------------------------------------------------
  // Floating draggable button (ported from the LinkedIn content script so
  // the user can move it out of the way of Gmail's own FAB / compose button).
  // -------------------------------------------------------------------------

  const DRAG_THRESHOLD = 5;

  function applyPosition(btn, left, top) {
    const w = btn.offsetWidth || 140;
    const h = btn.offsetHeight || 44;
    const L = Math.min(Math.max(0, left), Math.max(0, window.innerWidth - w));
    const T = Math.min(Math.max(0, top), Math.max(0, window.innerHeight - h));
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
      /* default bottom-right */
    }
  }

  function makeDraggable(btn) {
    let startX = 0, startY = 0, originLeft = 0, originTop = 0;
    let dragging = false, moved = false;

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      const rect = btn.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
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
      try { btn.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      delete btn.dataset.dragging;
      if (moved) {
        const rect = btn.getBoundingClientRect();
        try { chrome.storage.local.set({ [POS_KEY]: { left: rect.left, top: rect.top } }); } catch { /* ignore */ }
        // Swallow the synthetic click the browser fires after a drag.
        btn.dataset.justDragged = "1";
        setTimeout(() => {
          if (btn.dataset.justDragged === "1") delete btn.dataset.justDragged;
        }, 400);
      }
    }

    btn.addEventListener("pointerup", end);
    btn.addEventListener("pointercancel", end);
  }

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;
    if (!document.body) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "+ Add to ATS";
    btn.title = "Capture the open email into the ATS · drag to move";
    btn.addEventListener("click", () => {
      if (btn.dataset.justDragged === "1") {
        delete btn.dataset.justDragged;
        return;
      }
      runCapture(btn, false);
    });
    document.body.appendChild(btn);
    makeDraggable(btn);
    restorePosition(btn);
  }

  // -------------------------------------------------------------------------
  // Keep the button present. Gmail is a single-page app that re-renders
  // aggressively and routes via the URL hash (#inbox, #search/…, a thread
  // id). Poll briefly after load + nav, and re-assert via a MutationObserver
  // if Gmail ever drops our node. injectButton() no-ops once it exists.
  // -------------------------------------------------------------------------

  function pollInject(durationMs = 6000, intervalMs = 700) {
    const deadline = Date.now() + durationMs;
    injectButton();
    const timer = setInterval(() => {
      injectButton();
      if (Date.now() > deadline) clearInterval(timer);
    }, intervalMs);
  }

  pollInject();

  let lastHash = window.location.hash;
  const observer = new MutationObserver(() => {
    if (window.location.hash !== lastHash) {
      lastHash = window.location.hash;
      pollInject(3000);
    } else if (!document.getElementById(BUTTON_ID)) {
      injectButton();
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", () => pollInject(3000));
})();
