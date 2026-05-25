# ATS — Add Candidate from LinkedIn (Chrome extension)

One-click capture from any LinkedIn profile to the ATS.

## What it does

1. Adds a floating **"+ Add to ATS"** button to every `linkedin.com/in/<profile>` page.
2. When clicked, it scrapes:
   - The candidate's **name** (from the profile `<h1>` / `<title>`).
   - The **canonical LinkedIn URL** (cleaned of query strings and trailing slashes for dedupe).
   - The **full visible text** of the page (~80 KB cap).
3. POSTs the payload to your ATS at `/api/external/candidates`, with a bearer token.
4. The ATS saves the candidate immediately (~200 ms response) with `aiStatus = PENDING`.
5. A background AI worker (running either on Vercel cron or as a local Node script — see "AI worker" below) picks up the candidate, runs three Ollama / Claude / OpenAI passes, and fills in:
   - Structured fields (work history, education, summary, skills).
   - A **resume facsimile** — a polished, AI-rewritten resume rendered on the candidate page's "AI Resume" tab.
   - **Outreach personalization hooks** — specific things you could say in an opening email or LinkedIn message, drawn from recent posts/comments.

You'll see the result on the candidate's detail page within ~30 seconds.

## Install (unpacked, dev mode)

1. Open Chrome → `chrome://extensions`
2. Toggle **Developer mode** (top right) ON.
3. Click **Load unpacked**.
4. Pick the `chrome-extension/` folder inside this repo.
5. The extension's emerald "ATS" icon appears in your toolbar.

## Configure

1. **Generate an API token** in the ATS:
   - Open the ATS → **Settings → API tokens**.
   - Click **Generate token**, give it a name (e.g. *"Chrome on laptop"*), and copy the token. You won't see it again.
2. **Wire it into the extension:**
   - Click the extension's icon in the Chrome toolbar.
   - Paste your **ATS URL** — e.g. `https://your-ats.vercel.app` (no trailing slash).
   - Paste the **API token** (`ats_...`).
   - Click **Save**.

That's it. You're ready to use it.

## Use

1. Navigate to any LinkedIn profile: `https://www.linkedin.com/in/<someone>`.
2. Wait a moment for the profile to fully render (scroll to load the Activity section if you want it captured).
3. Click **+ Add to ATS** in the bottom-right corner.
4. A toast confirms the result:
   - **"Added Jane Smith. Click to open in ATS."** — created. Click the toast to open the candidate page.
   - **"Already in ATS as Jane Smith. Click to open."** — deduped; click to jump to the existing record.
   - **Red toast** — error; the message tells you why (bad token, ATS unreachable, etc.).
5. Open the candidate in the ATS. Initially you'll see the raw LinkedIn text. After ~30s, the **AI Resume** tab populates and the **Outreach personalization** section shows the AI-extracted hooks.

## AI worker

The AI passes that build the resume facsimile and the outreach hooks happen in the background, *not* during the Chrome click. You have two options for where the worker runs:

### Option 1: Vercel cron (works with Claude, OpenAI, Grok)

- Set your AI provider in the ATS at **Settings → AI provider** to one of those three.
- The repo's `vercel.json` already declares a cron at `* * * * *` (every minute) hitting `/api/internal/process-ai-queue`.
- Vercel runs the worker automatically. No machine to keep running.
- Add a `CRON_SECRET` env var on Vercel and use the same value as a Bearer token if you want to invoke the endpoint manually too.

### Option 2: Local script (works with Ollama on your LAN, e.g. `http://gx10.local:11434/v1`)

Vercel can't reach LAN addresses, so for local Ollama you need to run the worker on a machine that *can* reach both your Supabase DB and your Ollama box:

```
npm run process-ai-queue       # loop forever, polling every 30s
npm run process-ai-queue -- once  # process one batch and exit (good for cron)
```

The script reads `DATABASE_URL` from `.env`, and the AI provider from the same DB-backed `AIConfig` row the ATS uses — so whatever you picked in **Settings → AI provider** is what the worker uses.

## Troubleshooting

- **"Extension isn't configured"** — you haven't saved your ATS URL + token in the popup yet.
- **"API token rejected"** — the token was revoked, or the ATS URL points at the wrong deployment. Regenerate in **Settings → API tokens**.
- **"Couldn't find a name on this page"** — LinkedIn hasn't finished rendering. Wait a second and click again.
- **AI Resume tab stays blank for >5 minutes** — the worker isn't running, or your AI provider is misconfigured. Check **Settings → AI provider** (click *Test connection*). For LAN-Ollama setups, confirm `npm run process-ai-queue` is running and can reach your Ollama box.
- **Some content is missing from the LinkedIn capture** — scroll down on the profile to force-load the Activity section before clicking *Add to ATS*. LinkedIn lazy-loads it.

## Files

| File | Role |
|---|---|
| `manifest.json` | Chrome MV3 manifest — permissions, content scripts, icons |
| `content.js` | Runs on LinkedIn pages — injects button, scrapes profile |
| `background.js` | Service worker — handles cross-origin POST to ATS |
| `styles.css` | Styles the injected button + toast |
| `popup.html` / `popup.js` | Settings UI for the ATS URL + API token |
| `icons/` | 16×16 / 48×48 / 128×128 extension icons |
