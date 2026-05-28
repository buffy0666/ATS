// Small fuzzy-match toolkit for the CSV importer's choice-field flow.
// Used both to cluster distinct cell values into canonical options and to
// surface "did you mean?" near-duplicates the user should resolve before
// import (e.g. "Sr Engineer" vs "Senior Engineer").

/** Lowercase, trim, collapse whitespace, strip punctuation/symbols. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    // \p{L}=letters, \p{N}=digits across all scripts. Anything else becomes
    // a space so we can then collapse runs of spaces.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Standard iterative Levenshtein distance, O(|a|·|b|). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 0; i < a.length; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr[j + 1] = Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export type NearDuplicate = { left: string; right: string };

export type ClusterResult = {
  /** Canonical option list — one representative per equivalence class. */
  canonical: string[];
  /** raw cell value → canonical option name (input → output of normalization). */
  mergeMap: Record<string, string>;
  /** Pairs that look similar but weren't auto-merged; user must confirm. */
  nearDuplicates: NearDuplicate[];
};

/**
 * Group raw values into canonical options.
 *
 *  1. Values that share a normalized form auto-collapse (first occurrence
 *     wins as the representative). The user is NOT prompted for these —
 *     "Senior Engineer" and "senior  engineer " are obviously the same.
 *
 *  2. Among the surviving representatives, find pairs whose normalized
 *     forms are within Levenshtein distance 2 (and at least 3 chars long
 *     so we don't flag "us" vs "uk" etc.). These are returned as
 *     near-duplicates — the user reviews each and either merges or keeps
 *     them as separate options.
 */
export function clusterValues(rawValues: string[]): ClusterResult {
  const byNorm = new Map<string, string>(); // normalized -> first raw value
  const mergeMap: Record<string, string> = {};

  for (const raw of rawValues) {
    const norm = normalizeForMatch(raw);
    if (!norm) continue;
    if (byNorm.has(norm)) {
      mergeMap[raw] = byNorm.get(norm)!;
    } else {
      byNorm.set(norm, raw);
      mergeMap[raw] = raw;
    }
  }

  const canonical = Array.from(byNorm.values());
  const nearDuplicates: NearDuplicate[] = [];
  for (let i = 0; i < canonical.length; i++) {
    const a = normalizeForMatch(canonical[i]);
    for (let j = i + 1; j < canonical.length; j++) {
      const b = normalizeForMatch(canonical[j]);
      const d = levenshtein(a, b);
      if (d > 0 && d <= 2 && Math.min(a.length, b.length) >= 3) {
        nearDuplicates.push({ left: canonical[i], right: canonical[j] });
      }
    }
  }

  return { canonical, mergeMap, nearDuplicates };
}
