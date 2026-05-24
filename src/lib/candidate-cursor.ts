"use client";

/**
 * Lightweight "where did the user come from" tracker.
 *
 * When a candidate-list view (the main /candidates table, a /lists/[id]
 * page, a pipeline, etc.) renders, it writes the ordered list of candidate
 * IDs being displayed into localStorage under a single shared key. The
 * candidate detail page reads that cursor to render Prev/Next buttons that
 * walk the same ordering.
 *
 * localStorage (not the URL) was chosen because:
 *   - It survives prev/next without lengthening URLs with hundreds of IDs.
 *   - Filters and lists are inherently view-local — sharing a candidate URL
 *     shouldn't carry over the previous user's filter state.
 *   - Cross-tab cursor changes don't matter; the cursor is "what was the
 *     last list I looked at".
 *
 * The trade-off: opening the candidate link in a new tab loses cursor
 * context. That's acceptable — the buttons gracefully hide when no cursor
 * is found for the current candidate.
 */

const STORAGE_KEY = "ats:candidate-cursor:v1";

export type CandidateCursor = {
  ids: string[];
  /** Where the user came from — used for the "Back to …" label. */
  origin: { href: string; label: string };
  /** Wall-clock ms when written, used to expire stale cursors. */
  writtenAt: number;
};

/** Cursor is considered fresh for one hour. */
const MAX_AGE_MS = 60 * 60 * 1000;

export function writeCursor(value: Omit<CandidateCursor, "writtenAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CandidateCursor = { ...value, writtenAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / SecurityError — silently ignore. Buttons just won't appear.
  }
}

export function readCursor(): CandidateCursor | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CandidateCursor>;
    if (
      !parsed ||
      !Array.isArray(parsed.ids) ||
      !parsed.origin ||
      typeof parsed.origin.href !== "string" ||
      typeof parsed.writtenAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.writtenAt > MAX_AGE_MS) {
      // Stale — clear so we don't keep returning it.
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as CandidateCursor;
  } catch {
    return null;
  }
}

export function clearCursor(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
