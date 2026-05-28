// Popup: lets the user paste the ATS URL + API token and stores them in
// chrome.storage.local. The content script reads these to know where to POST.

// Pre-filled so a new user only has to paste their token. They can still
// overwrite it (custom domain / local dev).
const DEFAULT_ATS_URL = "https://ats-one-chi.vercel.app";

const urlEl = document.getElementById("atsUrl");
const tokenEl = document.getElementById("apiToken");
const saveEl = document.getElementById("save");
const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (kind ? " " + kind : "");
}

async function load() {
  const { atsUrl, apiToken } = await chrome.storage.local.get(["atsUrl", "apiToken"]);
  // Default the URL so the user only needs to paste a token.
  urlEl.value = atsUrl || DEFAULT_ATS_URL;
  if (apiToken) tokenEl.value = apiToken;
}

saveEl.addEventListener("click", async () => {
  let atsUrl = urlEl.value.trim();
  const apiToken = tokenEl.value.trim();

  if (!atsUrl) return setStatus("ATS URL is required.", "err");
  if (!apiToken) return setStatus("API token is required.", "err");
  if (!/^https?:\/\//i.test(atsUrl)) {
    return setStatus("URL must start with http:// or https://", "err");
  }
  // Normalize: strip trailing slash so we can append /api/external/candidates.
  atsUrl = atsUrl.replace(/\/+$/, "");

  saveEl.disabled = true;
  setStatus("Saving…");
  try {
    await chrome.storage.local.set({ atsUrl, apiToken });
    setStatus("Saved. Open a LinkedIn profile to add candidates.", "ok");
  } catch (err) {
    setStatus("Failed to save: " + (err?.message ?? err), "err");
  } finally {
    saveEl.disabled = false;
  }
});

load();
