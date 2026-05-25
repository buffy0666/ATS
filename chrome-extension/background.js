// Background service worker (MV3).
//
// The content script can't directly fetch the ATS API because LinkedIn's
// page is on a different origin and the API has its own CORS rules. The
// background worker is allowed unrestricted cross-origin fetches as long
// as the destination is declared in `host_permissions` in manifest.json
// — which we do for localhost and *.vercel.app.
//
// All this worker does:
//   1. Receive a {type: "ats:add-candidate", payload} message from content.js.
//   2. Read the configured ATS URL + API token from chrome.storage.local.
//   3. POST to <atsUrl>/api/external/candidates with Bearer auth.
//   4. Return the result back to the content script for display.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ats:add-candidate") return;

  // sendResponse must be returned async, so return true to keep the channel
  // open until our promise resolves.
  handleAddCandidate(message.payload)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({
        ok: false,
        error: err && err.message ? err.message : "Unknown background error.",
      });
    });
  return true;
});

async function handleAddCandidate(payload) {
  const { atsUrl, apiToken } = await chrome.storage.local.get(["atsUrl", "apiToken"]);

  if (!atsUrl || !apiToken) {
    return {
      ok: false,
      error:
        "Extension isn't configured — click the extension icon and set the ATS URL + API token.",
    };
  }

  const endpoint = atsUrl.replace(/\/+$/, "") + "/api/external/candidates";

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach ${endpoint}: ${err && err.message ? err.message : "fetch failed"}`,
    };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response — surface raw status.
  }

  // Make sure the candidate URL is absolute. If the server returns a
  // relative path (e.g. APP_URL env wasn't set on Vercel), window.open()
  // from a LinkedIn page would resolve it against linkedin.com — which is
  // exactly the bug we hit shipping 0.1.0. Normalize here so the toast
  // click always lands in the ATS regardless of server config.
  const absolutize = (url) => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    const base = atsUrl.replace(/\/+$/, "");
    return base + (url.startsWith("/") ? url : "/" + url);
  };
  if (body?.candidate?.url) {
    body.candidate.url = absolutize(body.candidate.url);
  }

  // ATS contract:
  //   201 → { status: "created", candidate: { id, firstName, lastName, url } }
  //   409 → { status: "exists",  candidate: { id, firstName, lastName, url } }
  //   401 → { error: "..." }
  //   422 → { error: "...", issues: [...] }
  if (response.status === 201 && body && body.status === "created") {
    return {
      ok: true,
      status: "created",
      candidateUrl: body.candidate?.url,
      candidate: body.candidate,
    };
  }
  if (response.status === 409 && body && body.status === "exists") {
    return {
      ok: true,
      status: "exists",
      candidate: body.candidate,
    };
  }
  if (response.status === 401) {
    return {
      ok: false,
      error: "API token rejected. Generate a new one in Settings → API tokens.",
    };
  }
  if (response.status === 422) {
    const issues = Array.isArray(body?.issues)
      ? body.issues.map((i) => `${i.path}: ${i.message}`).join("; ")
      : "";
    return {
      ok: false,
      error: `Validation error${issues ? " — " + issues : ""}`,
    };
  }

  return {
    ok: false,
    error: `ATS returned HTTP ${response.status}${body?.error ? " — " + body.error : ""}`,
  };
}
