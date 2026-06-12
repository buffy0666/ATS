/**
 * Per-column filter operator model for the candidates table.
 *
 * Each active column filter is stored in the URL as `qcol_<columnKey>=<op>:<payload>`
 * so filters stay bookmarkable/shareable and feed the "select all matching"
 * action. This module is the single source of truth for how that string is
 * encoded/decoded and which operators each filter type supports. It is PURE
 * (no React, no Prisma) so the client UI and the server `where` builder share it.
 *
 * Payload formats:
 *   text      contains|ncontains|is|nis  → the text;  empty|nempty → "" (no payload)
 *   choice    in|nin                      → comma-joined values
 *   number    range                       → "min..max" (either side may be blank)
 *             empty|nempty                → "" (no payload)
 *   date      range                       → "YYYY-MM-DD..YYYY-MM-DD" (either side blank)
 *             empty|nempty                → "" (no payload)
 *   presence  has|nhas                    → "" (no payload)
 */

export type FilterType = "text" | "choice" | "number" | "date" | "presence";

export type DecodedFilter = { op: string; value: string };

export const OPERATORS: Record<FilterType, { value: string; label: string; needsValue: boolean }[]> = {
  text: [
    { value: "contains", label: "contains", needsValue: true },
    { value: "ncontains", label: "does not contain", needsValue: true },
    { value: "is", label: "is", needsValue: true },
    { value: "nis", label: "is not", needsValue: true },
    { value: "empty", label: "is empty", needsValue: false },
    { value: "nempty", label: "is not empty", needsValue: false },
  ],
  choice: [
    { value: "in", label: "is any of", needsValue: true },
    { value: "nin", label: "is none of", needsValue: true },
  ],
  number: [
    { value: "range", label: "between", needsValue: true },
    { value: "empty", label: "is empty", needsValue: false },
    { value: "nempty", label: "is not empty", needsValue: false },
  ],
  date: [
    { value: "range", label: "between", needsValue: true },
    { value: "empty", label: "is empty", needsValue: false },
    { value: "nempty", label: "is not empty", needsValue: false },
  ],
  presence: [
    { value: "has", label: "has a value", needsValue: false },
    { value: "nhas", label: "is empty", needsValue: false },
  ],
};

export function defaultOp(type: FilterType): string {
  return OPERATORS[type][0].value;
}

/** Encode an operator + value into a `qcol` param value, or null to clear. */
export function encodeFilter(type: FilterType, op: string, value: string): string | null {
  const spec = OPERATORS[type].find((o) => o.value === op);
  if (!spec) return null;
  if (!spec.needsValue) return op; // e.g. "empty", "has"
  const v = (value ?? "").trim();
  if (!v) return null; // a value-requiring op with no value → no filter
  return `${op}:${v}`;
}

/** Decode a stored `qcol` param value back into { op, value }, or null if blank/garbage. */
export function decodeFilter(type: FilterType, raw: string | null | undefined): DecodedFilter | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  const op = idx === -1 ? raw : raw.slice(0, idx);
  const value = idx === -1 ? "" : raw.slice(idx + 1);
  const spec = OPERATORS[type].find((o) => o.value === op);
  if (!spec) {
    // Back-compat: legacy values had no operator prefix. Treat a bare value as
    // the type's default operator (contains for text, in for choice, etc.).
    return { op: defaultOp(type), value: raw };
  }
  if (spec.needsValue && !value.trim()) return null;
  return { op, value };
}

/** Split a "a..b" range payload into [min, max] (either may be ""). */
export function splitRange(value: string): [string, string] {
  const [a = "", b = ""] = value.split("..");
  return [a.trim(), b.trim()];
}

export function joinRange(min: string, max: string): string {
  return `${(min ?? "").trim()}..${(max ?? "").trim()}`;
}
