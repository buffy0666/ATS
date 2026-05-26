/*
 * Outlook Add-in task pane logic.
 *
 * Reads the currently-open email via the Office.js mailbox API (no DOM
 * scraping — this is the reliable replacement for the Chrome-extension
 * Outlook scraper) and POSTs it to the ATS /api/external/emails endpoint.
 *
 * Settings (ATS URL + API token) are stored in Office RoamingSettings,
 * which persists per-user across devices and survives Outlook restarts.
 */

let settings = { atsUrl: "", apiToken: "" };

Office.onReady((info) => {
  if (info.host !== Office.HostType.Outlook) return;

  // Load saved settings from roaming storage.
  const roaming = Office.context.roamingSettings;
  settings.atsUrl = roaming.get("atsUrl") || "";
  settings.apiToken = roaming.get("apiToken") || "";

  wireUpHandlers();

  if (settings.atsUrl && settings.apiToken) {
    showCaptureView();
  } else {
    showSettingsView(false);
  }
});

function wireUpHandlers() {
  document.getElementById("save-btn").addEventListener("click", onSaveSettings);
  document.getElementById("capture-btn").addEventListener("click", onCapture);
  document.getElementById("settings-link").addEventListener("click", () => showSettingsView(true));
  document.getElementById("back-link").addEventListener("click", showCaptureView);
}

// ---- Views -------------------------------------------------------------

function showCaptureView() {
  document.getElementById("settings-view").classList.add("hidden");
  document.getElementById("capture-view").classList.remove("hidden");
  renderPreview();
}

function showSettingsView(fromCapture) {
  document.getElementById("capture-view").classList.add("hidden");
  document.getElementById("settings-view").classList.remove("hidden");
  document.getElementById("atsUrl").value = settings.atsUrl;
  document.getElementById("apiToken").value = settings.apiToken;
  // Only show "Back" if we got here from a working config.
  document
    .getElementById("back-link")
    .classList.toggle("hidden", !fromCapture);
}

// ---- Settings ----------------------------------------------------------

function onSaveSettings() {
  const url = document.getElementById("atsUrl").value.trim().replace(/\/+$/, "");
  const token = document.getElementById("apiToken").value.trim();
  const status = document.getElementById("settings-status");

  if (!/^https?:\/\//i.test(url)) {
    status.className = "status err";
    status.textContent = "ATS URL must start with https://";
    return;
  }
  if (!token) {
    status.className = "status err";
    status.textContent = "API token is required.";
    return;
  }

  const roaming = Office.context.roamingSettings;
  roaming.set("atsUrl", url);
  roaming.set("apiToken", token);
  roaming.saveAsync((res) => {
    if (res.status === Office.AsyncResultStatus.Succeeded) {
      settings.atsUrl = url;
      settings.apiToken = token;
      status.className = "status ok";
      status.textContent = "Saved.";
      setTimeout(showCaptureView, 600);
    } else {
      status.className = "status err";
      status.textContent = "Couldn't save settings: " + (res.error?.message ?? "unknown");
    }
  });
}

// ---- Reading the open email -------------------------------------------

/**
 * Pull the open message into the same shape /api/external/emails expects.
 * Everything comes from Office.js — no scraping.
 */
function readCurrentEmail() {
  return new Promise((resolve, reject) => {
    const item = Office.context.mailbox.item;
    if (!item || item.itemType !== Office.MailboxEnums.ItemType.Message) {
      reject(new Error("Open an email message first."));
      return;
    }

    const myEmail = (Office.context.mailbox.userProfile?.emailAddress || "").toLowerCase();
    const fromAddr = (item.from?.emailAddress || "").toLowerCase();
    const fromName = item.from?.displayName || undefined;
    const to = (item.to || []).map((r) => (r.emailAddress || "").toLowerCase()).filter(Boolean);
    const cc = (item.cc || []).map((r) => (r.emailAddress || "").toLowerCase()).filter(Boolean);
    const subject = item.subject || "(no subject)";
    const sentAt = item.dateTimeCreated ? new Date(item.dateTimeCreated).toISOString() : undefined;
    const messageId = item.internetMessageId || undefined;
    // Direction relative to the mailbox owner.
    const direction = fromAddr && fromAddr === myEmail ? "OUTBOUND" : "INBOUND";

    // Body is async.
    item.body.getAsync(Office.CoercionType.Text, (res) => {
      const bodyText =
        res.status === Office.AsyncResultStatus.Succeeded ? res.value : "";
      resolve({
        myEmail,
        message: {
          messageId,
          from: fromAddr,
          fromName,
          to: to.length ? to : myEmail ? [myEmail] : [],
          cc,
          bcc: [],
          subject,
          sentAt,
          bodyText: (bodyText || "").slice(0, 100000),
          direction,
        },
      });
    });
  });
}

function renderPreview() {
  const el = document.getElementById("preview");
  const item = Office.context.mailbox.item;
  if (!item) {
    el.textContent = "No email open.";
    return;
  }
  const from = item.from
    ? `${item.from.displayName || ""} <${item.from.emailAddress || ""}>`
    : "(unknown)";
  el.innerHTML =
    `<div class="row"><span class="k">Subject:</span> ${escapeHtml(item.subject || "(none)")}</div>` +
    `<div class="row"><span class="k">From:</span> ${escapeHtml(from)}</div>`;
}

// ---- Capture -----------------------------------------------------------

async function onCapture() {
  const btn = document.getElementById("capture-btn");
  const status = document.getElementById("status");
  btn.disabled = true;
  btn.textContent = "Capturing…";
  status.className = "status";
  status.textContent = "";

  try {
    const { message } = await readCurrentEmail();

    const res = await fetch(`${settings.atsUrl}/api/external/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiToken}`,
      },
      body: JSON.stringify({ source: "EXTENSION_OUTLOOK", messages: [message] }),
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON */
    }

    if (res.status === 401) {
      status.className = "status err";
      status.textContent = "API token rejected. Update it in Connection settings.";
      return;
    }
    if (res.status !== 200 || !body) {
      status.className = "status err";
      status.textContent = `ATS error (HTTP ${res.status})${body?.error ? " — " + body.error : ""}.`;
      return;
    }

    if (body.status === "captured") {
      const c = body.candidate;
      const url = absolutize(c.url);
      const skipped = body.skipped ? ` (${body.skipped} already on file)` : "";
      status.className = "status ok";
      status.innerHTML =
        `Captured for <strong>${escapeHtml(c.firstName + " " + c.lastName)}</strong>${skipped}. ` +
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open in ATS →</a>`;
      return;
    }

    if (body.status === "no-candidate-matched") {
      const u = body.unmatched;
      if (u) {
        const url = absolutize(body.createCandidateUrl);
        status.className = "status info";
        status.innerHTML =
          `No candidate for <strong>${escapeHtml(u.email)}</strong>. ` +
          `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Create candidate →</a>`;
      } else {
        status.className = "status err";
        status.textContent = "Couldn't determine the external party in this email.";
      }
      return;
    }

    status.className = "status err";
    status.textContent = "Unexpected response from ATS.";
  } catch (err) {
    status.className = "status err";
    status.textContent = err && err.message ? err.message : "Capture failed.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Capture to ATS";
  }
}

// ---- helpers -----------------------------------------------------------

function absolutize(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return settings.atsUrl.replace(/\/+$/, "") + (url.startsWith("/") ? url : "/" + url);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
