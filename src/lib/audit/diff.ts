import "server-only";

/**
 * Field-diff helpers shared by the Prisma extension and explicit-event
 * callers. The point is to (1) ignore fields that don't carry signal,
 * (2) cap big values so an audit row stays under a sensible size, and
 * (3) drop sensitive secrets entirely.
 */

const MAX_VALUE_BYTES = 2048;

/**
 * Fields that should never appear in an audit diff. Either secrets
 * (password hashes, encrypted API keys) or unhelpful churn
 * (`updatedAt`/timestamps that always change on every update).
 */
const FIELD_SKIP: Set<string> = new Set([
  "passwordHash",
  "apiKeyEncrypted",
  "tokenHash",
  "iCalToken",
  "updatedAt",
]);

export type DiffEntry = {
  before: unknown;
  after: unknown;
  truncated?: "before" | "after" | "both";
};

export type Diff = Record<string, DiffEntry>;

/**
 * Builds a field-level diff between two row snapshots. Returns the set of
 * keys that actually changed and the per-field before/after, with values
 * truncated for storage sanity.
 */
export function buildDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { changedFields: string[]; diff: Diff } {
  const keys = new Set<string>([
    ...(before ? Object.keys(before) : []),
    ...(after ? Object.keys(after) : []),
  ]);
  const changedFields: string[] = [];
  const diff: Diff = {};
  for (const key of keys) {
    if (FIELD_SKIP.has(key)) continue;
    const b = before?.[key];
    const a = after?.[key];
    if (sameValue(b, a)) continue;
    changedFields.push(key);
    const beforeCapped = truncateValue(b);
    const afterCapped = truncateValue(a);
    const entry: DiffEntry = { before: beforeCapped.value, after: afterCapped.value };
    if (beforeCapped.truncated && afterCapped.truncated) entry.truncated = "both";
    else if (beforeCapped.truncated) entry.truncated = "before";
    else if (afterCapped.truncated) entry.truncated = "after";
    diff[key] = entry;
  }
  changedFields.sort();
  return { changedFields, diff };
}

/**
 * Snapshot a single row for CREATE/DELETE auditing — same shape as the
 * `diff` field above (one entry per non-skipped field), with `before`
 * empty for CREATE and `after` empty for DELETE.
 */
export function snapshotForCreate(row: Record<string, unknown>): { changedFields: string[]; diff: Diff } {
  const diff: Diff = {};
  const changedFields: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (FIELD_SKIP.has(key)) continue;
    if (value === null || value === undefined) continue;
    const capped = truncateValue(value);
    diff[key] = { before: null, after: capped.value };
    if (capped.truncated) diff[key].truncated = "after";
    changedFields.push(key);
  }
  changedFields.sort();
  return { changedFields, diff };
}

export function snapshotForDelete(row: Record<string, unknown>): { changedFields: string[]; diff: Diff } {
  const diff: Diff = {};
  const changedFields: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (FIELD_SKIP.has(key)) continue;
    if (value === null || value === undefined) continue;
    const capped = truncateValue(value);
    diff[key] = { before: capped.value, after: null };
    if (capped.truncated) diff[key].truncated = "before";
    changedFields.push(key);
  }
  changedFields.sort();
  return { changedFields, diff };
}

/**
 * Caps a single value to MAX_VALUE_BYTES of JSON. Strings get a clear
 * "...truncated, N chars" marker so audit readers know the original was
 * larger than what's shown.
 */
export function truncateValue(value: unknown): { value: unknown; truncated: boolean } {
  if (value === null || value === undefined) return { value, truncated: false };
  if (value instanceof Date) return { value: value.toISOString(), truncated: false };

  if (typeof value === "string") {
    if (value.length > MAX_VALUE_BYTES) {
      return {
        value: `${value.slice(0, 200)}… [truncated, ${value.length} chars]`,
        truncated: true,
      };
    }
    return { value, truncated: false };
  }

  // For objects / arrays / numbers / booleans — measure via JSON length.
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return { value: "[unserializable]", truncated: true };
  }
  if (json.length > MAX_VALUE_BYTES) {
    return { value: `[truncated, ${json.length} bytes]`, truncated: true };
  }
  return { value, truncated: false };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  if (
    typeof a === "object" &&
    typeof b === "object" &&
    a !== null &&
    b !== null
  ) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
