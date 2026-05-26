// Outlook web content script.
//
// Runs on outlook.office.com / outlook.live.com / outlook.office365.com.
// Injects an "+ Add to ATS" button at the top of an open email/thread,
// scrapes the visible messages on click, and ships them to the ATS
// /api/external/emails endpoint via the background worker.
//
// Outlook web's UI is a React SPA so we use a MutationObserver to detect
// when the user opens an email and to keep our button alive across
// navigation. We're DEFENSIVE about selectors because Outlook ships
// frequent UI tweaks — anywhere we can't find a stable hook, we fall
// back to text-content matching and tolerate misses.

(function () {
  "use strict";

  console.log("[ATS extension] Outlook content script loaded on", window.location.href);

  const BUTTON_ID = "ats-outlook-add-button";
  const TOAST_ID = "ats-toast";

  // -------------------------------------------------------------------------
  // Button injection
  // -------------------------------------------------------------------------
  //
  // We ALWAYS show the button once the script is on an Outlook page. We do
  // NOT gate it on detecting an open email — that detection relies on DOM
  // selectors that vary across Outlook versions, and gating the button on
  // it meant the button silently never appeared (the bug we're fixing).
  // Instead, the "is an email actually open?" check happens at CLICK time:
  // if scraping finds nothing, we toast "Open an email first".

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;
    if (!document.body) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "+ Add to ATS";
    btn.title = "Capture the open email (and its thread) into the ATS";
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
    console.log("[ATS extension] Add-to-ATS button injected.");
  }

  // -------------------------------------------------------------------------
  // Email scraping
  // -------------------------------------------------------------------------

  /**
   * Find every message bubble in the currently open thread. Outlook wraps
   * each message in a `<div data-convid="...">` or, in some variants, in
   * an `<article>` with a role attribute. We try both, dedupe by element.
   */
  function findMessageBubbles() {
    const set = new Set();
    const a = document.querySelectorAll('div[data-convid], article[role="document"]');
    a.forEach((el) => set.add(el));
    // Fallback: any container whose innerText contains "From:" near the
    // top, which is the universal Outlook message-card pattern.
    if (set.size === 0) {
      const mainPane =
        document.querySelector('div[data-app-section="ReadingPane"]') ||
        document.querySelector('div[role="main"]') ||
        document.body;
      mainPane.querySelectorAll("div").forEach((el) => {
        const t = (el.innerText || "").slice(0, 200);
        if (/^\s*From:\s/m.test(t) && /^\s*To:\s/m.test(t)) set.add(el);
      });
    }
    return Array.from(set);
  }

  /**
   * Parse the subject line. The subject heading is whatever wraps the H1
   * (or the deepest heading) inside the reading pane.
   */
  function scrapeSubject() {
    const candidates = [
      document.querySelector('div[role="main"] h1'),
      document.querySelector('div[role="main"] h2'),
      document.querySelector('[role="heading"][aria-level="1"]'),
      document.querySelector('[role="heading"][aria-level="2"]'),
    ].filter(Boolean);
    for (const el of candidates) {
      const t = (el.textContent || "").trim();
      if (t && t.length < 998) return t;
    }
    return "(no subject)";
  }

  /**
   * Figure out which email address the signed-in Outlook user has. We use
   * the account-switcher button's aria-label (e.g. "Account manager for
   * andy@example.com") and fall back to scraping any "mailto:" link in
   * the header.
   */
  function scrapeMyEmail() {
    const accountBtn = document.querySelector(
      '[aria-label*="@"][aria-label*="Account"]',
    );
    if (accountBtn) {
      const label = accountBtn.getAttribute("aria-label") || "";
      const m = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/.exec(label);
      if (m) return m[1].toLowerCase();
    }
    // Fallback: any element with class hinting at "user account" + email.
    const fallback = document.body.innerText.match(
      /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/,
    );
    return fallback ? fallback[1].toLowerCase() : null;
  }

  /**
   * Parse a single message bubble into {from, fromName, to, cc, subject,
   * sentAt, bodyText, messageId, direction}.
   *
   * Outlook's exposed "From:" / "To:" labels are usually visually-hidden
   * accessibility spans, so we read from aria-labels first and fall back
   * to scanning visible text.
   */
  function parseMessageBubble(bubble, myEmail) {
    const text = (bubble.innerText || "").replace(/ /g, " ");

    // Find addresses via "Name <email>" patterns or bare emails.
    const emailRe =
      /(?:"?([^"<]+)"?\s*<)?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?/g;
    const all = [];
    let m;
    while ((m = emailRe.exec(text)) !== null) {
      const name = (m[1] || "").trim().replace(/^"|"$/g, "");
      const addr = m[2].toLowerCase();
      all.push({ name, addr });
    }

    // The "From" address is typically the first one that appears after a
    // "From:" label, or the first email in the bubble if no label.
    const fromMatch = text.match(
      /From:\s*"?([^"<\n]+)"?\s*<?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?/i,
    );
    const from = fromMatch ? fromMatch[2].toLowerCase() : all[0]?.addr;
    const fromName = fromMatch
      ? fromMatch[1].trim().replace(/^"|"$/g, "")
      : all[0]?.name;

    const to = [];
    const cc = [];
    const toMatch = text.match(/To:\s*([^\n]+)/i);
    const ccMatch = text.match(/Cc:\s*([^\n]+)/i);
    const collect = (line, arr) => {
      if (!line) return;
      const localRe =
        /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
      let mm;
      while ((mm = localRe.exec(line)) !== null) {
        arr.push(mm[1].toLowerCase());
      }
    };
    collect(toMatch?.[1], to);
    collect(ccMatch?.[1], cc);

    // Date — look for a parseable date string near the top of the bubble.
    let sentAt;
    const dateLine =
      text.match(/(?:Sent|Date):\s*([^\n]+)/i)?.[1] ??
      // Common visible format: "Tue 5/14/2026 9:32 AM"
      text.match(/[A-Z][a-z]{2,3}\s+\d{1,2}\/\d{1,2}\/\d{2,4}[^\n]*/)?.[0];
    if (dateLine) {
      const d = new Date(dateLine);
      if (!Number.isNaN(d.getTime())) sentAt = d.toISOString();
    }

    // Body: everything below the headers. We split on the first blank line
    // after the To/Cc/Date block and treat the rest as body.
    let bodyText = text;
    const headerEndMatch = bodyText.match(
      /(?:From|To|Cc|Sent|Date):[^\n]*\n+/g,
    );
    if (headerEndMatch) {
      // Find the last header line and slice after it.
      const lastIdx = bodyText.lastIndexOf(headerEndMatch[headerEndMatch.length - 1]);
      const sliceFrom = lastIdx + headerEndMatch[headerEndMatch.length - 1].length;
      bodyText = bodyText.slice(sliceFrom).trim();
    }
    // Compress runs of blank lines.
    bodyText = bodyText.replace(/\n{3,}/g, "\n\n").slice(0, 100_000);

    // Direction: if I'm the sender, it's OUTBOUND; otherwise INBOUND.
    const direction =
      myEmail && from === myEmail.toLowerCase() ? "OUTBOUND" : "INBOUND";

    // Outlook doesn't expose Message-ID in the DOM. We synthesize one
    // from the subject + from + sent timestamp so re-clicking the same
    // thread dedupes. Real Message-IDs come later (webhook / OAuth path).
    const syntheticId = `outlook-${hashStr(
      (sentAt ?? "") + "|" + from + "|" + (bodyText.slice(0, 200) || ""),
    )}@ats-extension.local`;

    return {
      from,
      fromName: fromName || undefined,
      to: to.length > 0 ? to : myEmail ? [myEmail] : [],
      cc,
      bcc: [],
      subject: "", // filled in by caller from the thread-level subject
      sentAt,
      bodyText,
      messageId: syntheticId,
      direction,
    };
  }

  function hashStr(s) {
    // Lightweight non-crypto hash. Good enough for dedup keys.
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  /**
   * Scrape every message in the open thread. Returns null if we can't
   * find the user's email (without it we can't tag direction correctly).
   */
  function scrapeThread() {
    const myEmail = scrapeMyEmail();
    if (!myEmail) {
      return { error: "Couldn't determine your Outlook email address." };
    }
    const subject = scrapeSubject();
    const bubbles = findMessageBubbles();
    console.log(
      `[ATS extension] myEmail=${myEmail}, subject="${subject}", bubbles found=${bubbles.length}`,
    );
    if (bubbles.length === 0) {
      return {
        error:
          "No open email detected. Open an email (not just the inbox list) and try again.",
      };
    }
    const messages = [];
    for (const b of bubbles) {
      const parsed = parseMessageBubble(b, myEmail);
      if (!parsed.from) continue;
      // Skip if To is empty AND I'm not the From — happens when the
      // bubble parse failed to find recipients. Defaulting To to my email
      // is reasonable for INBOUND messages I received.
      if (parsed.to.length === 0) parsed.to = [myEmail];
      parsed.subject = subject;
      messages.push(parsed);
    }
    if (messages.length === 0) {
      return {
        error: "Found message bubbles but couldn't parse any of them — Outlook may have changed its layout.",
      };
    }
    console.log(
      `[ATS extension] Scraped ${messages.length} messages from Outlook thread "${subject}".`,
    );
    return { messages };
  }

  // -------------------------------------------------------------------------
  // Click handler + toast
  // -------------------------------------------------------------------------

  async function onClick(event) {
    const btn = event.currentTarget;
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    const previous = btn.textContent;
    btn.textContent = "Saving…";
    btn.disabled = true;

    try {
      const result = scrapeThread();
      if (result.error) {
        toast(result.error, "error");
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: "ats:add-emails",
        payload: {
          source: "EXTENSION_OUTLOOK",
          messages: result.messages,
        },
      });

      if (!response) {
        toast("No response from the extension background worker. Reload the page.", "error");
        return;
      }

      if (response.ok && response.status === "captured") {
        const c = response.candidate;
        const skipped = response.skipped
          ? ` (${response.skipped} already on file)`
          : "";
        toast(
          `Captured ${response.captured} message${
            response.captured === 1 ? "" : "s"
          } for ${c.firstName} ${c.lastName}${skipped}. Click to open.`,
          "success",
          c.url,
        );
        return;
      }

      if (response.ok && response.status === "no-candidate-matched") {
        const u = response.unmatched;
        if (u) {
          toast(
            `No candidate in your ATS for ${u.email}. Click to create one.`,
            "info",
            response.createCandidateUrl,
          );
        } else {
          toast(
            "Couldn't find an external party in this thread to match a candidate against.",
            "error",
          );
        }
        return;
      }

      toast(response.error ?? "Couldn't capture the emails.", "error");
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
   * Toast pinned bottom-right. Same component as the LinkedIn content
   * script — defined here standalone so this script doesn't depend on
   * the LinkedIn file having loaded.
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

    const ttl = kind === "error" ? 8000 : 5000;
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, ttl);
  }

  // -------------------------------------------------------------------------
  // Re-inject on SPA navigation
  // -------------------------------------------------------------------------

  injectButton();
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(injectButton, 500);
    } else {
      // URL didn't change but DOM did — could be the user clicking on a
      // different message in the same thread list. Re-check.
      injectButton();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
