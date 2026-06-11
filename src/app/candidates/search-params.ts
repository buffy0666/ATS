/**
 * Shared helpers for the candidates list URL state.
 *
 * Every filter is encoded as a query-string param so saved searches are just
 * the param string. Multi-selects use comma-separated values; ranges use
 * `min`/`max`; booleans use `"true"` when active.
 */

export const ADVANCED_FILTER_KEYS = [
  "status",
  "source",
  "tag",
  "workAuth",
  "seniority",
  "remotePref",
  "employmentType",
  "yearsMin",
  "yearsMax",
  "salaryMin",
  "salaryMax",
  "hasResume",
  "lastContactedDays",
  "addedDays",
  // Exclusion ("is not") mirrors of the multi-selects.
  "notStatus",
  "notSource",
  "notTag",
  "notWorkAuth",
  "notSeniority",
  "notRemotePref",
  "notEmploymentType",
  // List membership include / exclude.
  "inLists",
  "notInLists",
  // Presence.
  "hasEmail",
  "hasPhone",
  "hasLinkedin",
  // Compliance one-click excludes.
  "exDoNotContact",
  "exUnsubscribed",
  "exBlacklisted",
  "exPlaced",
  // Pipeline excludes.
  "notOnJob",
  "notInSequence",
  // Advanced filter-builder rules (JSON). A filter too, so it counts toward
  // "is any filter active?" and gets cleared with the rest.
  "fb",
] as const;

export type AdvancedFilterKey = (typeof ADVANCED_FILTER_KEYS)[number];

export const MULTI_SELECT_KEYS = new Set<AdvancedFilterKey>([
  "status",
  "source",
  "tag",
  "workAuth",
  "seniority",
  "remotePref",
  "employmentType",
  "notStatus",
  "notSource",
  "notTag",
  "notWorkAuth",
  "notSeniority",
  "notRemotePref",
  "notEmploymentType",
  "inLists",
  "notInLists",
]);

/**
 * Sentinel for a multi-select's negate companion param. `<key>_op=exclude`
 * flips that group from "match any of" to "match none of". Any other/absent
 * value means include.
 */
export function negateKey(key: string): string {
  return `${key}_op`;
}

export function isExcluded(
  params: URLSearchParams,
  key: string,
): boolean {
  return params.get(negateKey(key)) === "exclude";
}

export function parseMultiValue(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeMultiValue(values: string[]): string | null {
  const cleaned = Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
  return cleaned.length ? cleaned.join(",") : null;
}

export function parsePositiveInt(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function hasAnyAdvancedFilter(params: URLSearchParams): boolean {
  for (const key of ADVANCED_FILTER_KEYS) {
    const v = params.get(key);
    if (v && v.length > 0) return true;
  }
  return false;
}

export function clearAdvancedFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const key of ADVANCED_FILTER_KEYS) next.delete(key);
  return next;
}
