/**
 * Advanced filter builder — a shared registry + (de)serializer + Prisma mapper
 * used by both the client UI (FilterBuilder.tsx) and the server query
 * (candidates/page.tsx).
 *
 * A "view" stores its rules in the `fb` URL param as JSON. Each rule is a
 * {field, operator, values} triple; rules are AND-ed together. Operators
 * include negative forms (isNot / notContains / hasNone / isEmpty) which is
 * what gives the list true negative filtering.
 *
 * NOTE: only `Prisma` the *type* is imported (erased at build), so importing
 * this module from a client component pulls in no server-only runtime.
 */
import type { Prisma } from "@/generated/prisma";
import {
  CandidateStatus,
  EmploymentType,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";

export type FilterType =
  | "text"
  | "enum"
  | "number"
  | "date"
  | "bool"
  | "array"
  | "tags";

export type Operator =
  | "contains"
  | "notContains"
  | "is"
  | "isNot"
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "between"
  | "after"
  | "before"
  | "isTrue"
  | "isFalse"
  | "hasAny"
  | "hasNone"
  | "isEmpty"
  | "isNotEmpty";

export const OPERATOR_LABELS: Record<Operator, string> = {
  contains: "contains",
  notContains: "does not contain",
  is: "is",
  isNot: "is not",
  eq: "=",
  neq: "≠",
  gt: "greater than",
  lt: "less than",
  between: "between",
  after: "on or after",
  before: "on or before",
  isTrue: "is yes",
  isFalse: "is no",
  hasAny: "has any of",
  hasNone: "has none of",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

export const OPERATORS_BY_TYPE: Record<FilterType, Operator[]> = {
  text: ["contains", "notContains", "is", "isNot", "isEmpty", "isNotEmpty"],
  enum: ["is", "isNot", "isEmpty", "isNotEmpty"],
  number: ["eq", "neq", "gt", "lt", "between", "isEmpty", "isNotEmpty"],
  date: ["after", "before", "between", "isEmpty", "isNotEmpty"],
  bool: ["isTrue", "isFalse"],
  array: ["hasAny", "hasNone", "isEmpty", "isNotEmpty"],
  tags: ["hasAny", "hasNone", "isEmpty", "isNotEmpty"],
};

/** Operators that take no value input (the value control is hidden). */
export const NO_VALUE_OPERATORS = new Set<Operator>([
  "isEmpty",
  "isNotEmpty",
  "isTrue",
  "isFalse",
]);

/** Operators that take two value inputs (a range). */
export const RANGE_OPERATORS = new Set<Operator>(["between"]);

/** Operators whose value is one-or-more choices from a fixed/known set. */
export const MULTI_VALUE_OPERATORS = new Set<Operator>([
  "is",
  "isNot",
  "hasAny",
  "hasNone",
]);

export type FilterFieldDef = {
  /**
   * Candidate scalar field name, or a relation sentinel ("name", "tags",
   * "lists", "jobs", "client", "sourcedBy") special-cased in ruleToWhere.
   */
  key: string;
  label: string;
  type: FilterType;
  /** Fixed option values (enum-backed fields). */
  staticOptions?: string[];
  /** Marks options that must be filled at runtime from page data. */
  dynamicOptions?:
    | "source"
    | "seniority"
    | "tags"
    | "lists"
    | "clients"
    | "users"
    | "rejectionReasons";
};

export const FILTER_FIELDS: FilterFieldDef[] = [
  // Identity / contact
  { key: "name", label: "Name", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "alternateEmail", label: "Alt email", type: "text" },
  { key: "alternatePhone", label: "Alt phone", type: "text" },

  // Core
  {
    key: "status",
    label: "Status",
    type: "enum",
    staticOptions: Object.values(CandidateStatus),
  },
  { key: "rating", label: "Rating", type: "number" },
  { key: "tags", label: "Tags", type: "tags", dynamicOptions: "tags" },
  { key: "lists", label: "Lists", type: "tags", dynamicOptions: "lists" },
  { key: "jobs", label: "Job title", type: "text" },
  { key: "client", label: "Client", type: "enum", dynamicOptions: "clients" },
  { key: "rejectionReasons", label: "Rejection reason", type: "array", dynamicOptions: "rejectionReasons" },
  { key: "source", label: "Source", type: "enum", dynamicOptions: "source" },
  { key: "sourcedBy", label: "Sourced by", type: "enum", dynamicOptions: "users" },

  // Location
  { key: "locationCity", label: "City", type: "text" },
  { key: "locationState", label: "State", type: "text" },
  { key: "locationCountry", label: "Country", type: "text" },
  { key: "timezone", label: "Timezone", type: "text" },
  { key: "willingToRelocate", label: "Will relocate", type: "bool" },

  // Career
  { key: "currentTitle", label: "Current title", type: "text" },
  { key: "currentCompany", label: "Current company", type: "text" },
  { key: "yearsExperience", label: "Years experience", type: "number" },
  { key: "seniority", label: "Seniority", type: "enum", dynamicOptions: "seniority" },

  // Authorization
  {
    key: "workAuthorization",
    label: "Work authorization",
    type: "enum",
    staticOptions: Object.values(WorkAuth),
  },
  { key: "requiresSponsorship", label: "Needs sponsorship", type: "bool" },

  // Compensation
  { key: "desiredSalaryMin", label: "Desired salary min", type: "number" },
  { key: "desiredSalaryMax", label: "Desired salary max", type: "number" },
  { key: "currentSalary", label: "Current salary", type: "number" },

  // Availability
  { key: "availableFrom", label: "Available from", type: "date" },
  { key: "noticePeriodDays", label: "Notice (days)", type: "number" },
  {
    key: "remotePref",
    label: "Remote preference",
    type: "array",
    staticOptions: Object.values(RemotePref),
  },
  {
    key: "employmentTypePref",
    label: "Employment type",
    type: "array",
    staticOptions: Object.values(EmploymentType),
  },

  // Focus (free-text string arrays — no fixed options)
  { key: "industries", label: "Industries", type: "array" },
  { key: "specialties", label: "Specialties", type: "array" },

  // Source / follow-up
  { key: "lastContactedAt", label: "Last contacted", type: "date" },
  { key: "nextFollowUpAt", label: "Next follow-up", type: "date" },
  { key: "createdAt", label: "Added", type: "date" },

  // Links (URL fields — "is empty / is not empty" doubles as has/has-no link)
  { key: "linkedinUrl", label: "LinkedIn URL", type: "text" },
  { key: "githubUrl", label: "GitHub URL", type: "text" },
  { key: "portfolioUrl", label: "Portfolio URL", type: "text" },
  { key: "resumeUrl", label: "Resume URL", type: "text" },

  // Misc
  { key: "summary", label: "Summary", type: "text" },
];

export const FILTER_FIELD_BY_KEY: Record<string, FilterFieldDef> =
  Object.fromEntries(FILTER_FIELDS.map((f) => [f.key, f]));

export type FilterRule = {
  /** field key (matches a FilterFieldDef.key) */
  f: string;
  op: Operator;
  /** values; [] for no-value ops, [a,b] for ranges, [a,b,…] for multi */
  v: string[];
};

/** Serialize rules for the `fb` URL param. URLSearchParams handles encoding. */
export function encodeRules(rules: FilterRule[]): string {
  const cleaned = rules.filter((r) => r.f && r.op);
  return cleaned.length ? JSON.stringify(cleaned) : "";
}

/** Parse the `fb` param value back into rules; tolerant of malformed input. */
export function decodeRules(raw: string | null | undefined): FilterRule[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: FilterRule[] = [];
    for (const r of parsed) {
      if (!r || typeof r.f !== "string" || typeof r.op !== "string") continue;
      const v = Array.isArray(r.v)
        ? r.v.map((x: unknown) => String(x))
        : r.v == null
          ? []
          : [String(r.v)];
      out.push({ f: r.f, op: r.op as Operator, v });
    }
    return out;
  } catch {
    return [];
  }
}

/** Whether a rule has the value(s) its operator needs (else it's a no-op). */
export function isRuleComplete(rule: FilterRule): boolean {
  const def = FILTER_FIELD_BY_KEY[rule.f];
  if (!def) return false;
  if (NO_VALUE_OPERATORS.has(rule.op)) return true;
  const vals = (rule.v ?? []).map((s) => s.trim()).filter(Boolean);
  if (RANGE_OPERATORS.has(rule.op)) return vals.length >= 1; // at least one bound
  return vals.length >= 1;
}

const asWhere = (o: Record<string, unknown>): Prisma.CandidateWhereInput =>
  o as Prisma.CandidateWhereInput;

const num = (s: string | undefined): number | null => {
  if (s == null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const date = (s: string | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Map a single rule to a Prisma where clause. Returns null when the rule is
 * incomplete/unknown so the caller can skip it. This is the single source of
 * truth for how every operator behaves on the server.
 */
export function ruleToWhere(rule: FilterRule): Prisma.CandidateWhereInput | null {
  const def = FILTER_FIELD_BY_KEY[rule.f];
  if (!def) return null;
  const { op } = rule;
  const v = (rule.v ?? []).map((s) => s);
  const text = (v[0] ?? "").trim();
  const field = def.key;

  // Name fans out across firstName + lastName.
  if (field === "name") {
    const ci = { contains: text, mode: "insensitive" as const };
    const eq = { equals: text, mode: "insensitive" as const };
    switch (op) {
      case "contains":
        return text ? { OR: [{ firstName: ci }, { lastName: ci }] } : null;
      case "notContains":
        return text
          ? { AND: [{ NOT: { firstName: ci } }, { NOT: { lastName: ci } }] }
          : null;
      case "is":
        return text ? { OR: [{ firstName: eq }, { lastName: eq }] } : null;
      case "isNot":
        return text
          ? { AND: [{ NOT: { firstName: eq } }, { NOT: { lastName: eq } }] }
          : null;
      default:
        return null;
    }
  }

  // List membership — same shape as tags, via the listMemberships relation.
  if (field === "lists") {
    const names = v.map((s) => s.trim()).filter(Boolean);
    switch (op) {
      case "hasAny":
        return names.length
          ? { listMemberships: { some: { list: { name: { in: names } } } } }
          : null;
      case "hasNone":
        return names.length
          ? { NOT: { listMemberships: { some: { list: { name: { in: names } } } } } }
          : null;
      case "isEmpty":
        return { listMemberships: { none: {} } };
      case "isNotEmpty":
        return { listMemberships: { some: {} } };
      default:
        return null;
    }
  }

  // Job title — text match through the candidate's applications.
  if (field === "jobs") {
    const match = { job: { title: { contains: text, mode: "insensitive" as const } } };
    const eqMatch = { job: { title: { equals: text, mode: "insensitive" as const } } };
    switch (op) {
      case "contains":
        return text ? { applications: { some: match } } : null;
      case "notContains":
        return text ? { applications: { none: match } } : null;
      case "is":
        return text ? { applications: { some: eqMatch } } : null;
      case "isNot":
        return text ? { applications: { none: eqMatch } } : null;
      case "isEmpty":
        return { applications: { none: {} } };
      case "isNotEmpty":
        return { applications: { some: {} } };
      default:
        return null;
    }
  }

  // Client — values are client IDs, matched through applications → job.
  if (field === "client") {
    const ids = v.map((s) => s.trim()).filter(Boolean);
    switch (op) {
      case "is":
        return ids.length
          ? { applications: { some: { job: { clientId: { in: ids } } } } }
          : null;
      case "isNot":
        return ids.length
          ? { applications: { none: { job: { clientId: { in: ids } } } } }
          : null;
      case "isEmpty":
        return { applications: { none: { job: { clientId: { not: null } } } } };
      case "isNotEmpty":
        return { applications: { some: { job: { clientId: { not: null } } } } };
      default:
        return null;
    }
  }

  // Sourced by — values are user IDs on the sourcedById scalar. "is not"
  // keeps candidates with no sourcer (NOT IN drops NULLs in Postgres).
  if (field === "sourcedBy") {
    const ids = v.map((s) => s.trim()).filter(Boolean);
    switch (op) {
      case "is":
        return ids.length ? { sourcedById: { in: ids } } : null;
      case "isNot":
        return ids.length
          ? { OR: [{ sourcedById: null }, { sourcedById: { notIn: ids } }] }
          : null;
      case "isEmpty":
        return { sourcedById: null };
      case "isNotEmpty":
        return { NOT: { sourcedById: null } };
      default:
        return null;
    }
  }

  if (def.type === "tags") {
    const names = v.map((s) => s.trim()).filter(Boolean);
    switch (op) {
      case "hasAny":
        return names.length ? { tags: { some: { name: { in: names } } } } : null;
      case "hasNone":
        return names.length
          ? { NOT: { tags: { some: { name: { in: names } } } } }
          : null;
      case "isEmpty":
        return { tags: { none: {} } };
      case "isNotEmpty":
        return { tags: { some: {} } };
      default:
        return null;
    }
  }

  switch (def.type) {
    case "text": {
      const ci = { contains: text, mode: "insensitive" as const };
      const eq = { equals: text, mode: "insensitive" as const };
      switch (op) {
        case "contains":
          return text ? asWhere({ [field]: ci }) : null;
        case "notContains":
          return text ? asWhere({ NOT: { [field]: ci } }) : null;
        case "is":
          return text ? asWhere({ [field]: eq }) : null;
        case "isNot":
          return text ? asWhere({ NOT: { [field]: eq } }) : null;
        case "isEmpty":
          return asWhere({ OR: [{ [field]: null }, { [field]: "" }] });
        case "isNotEmpty":
          return asWhere({
            AND: [{ NOT: { [field]: null } }, { NOT: { [field]: "" } }],
          });
        default:
          return null;
      }
    }
    case "enum": {
      switch (op) {
        case "is": {
          const vals = v.map((s) => s.trim()).filter(Boolean);
          return vals.length ? asWhere({ [field]: { in: vals } }) : null;
        }
        case "isNot": {
          const vals = v.map((s) => s.trim()).filter(Boolean);
          return vals.length ? asWhere({ [field]: { notIn: vals } }) : null;
        }
        case "isEmpty":
          return asWhere({ [field]: null });
        case "isNotEmpty":
          return asWhere({ NOT: { [field]: null } });
        default:
          return null;
      }
    }
    case "number": {
      const n0 = num(v[0]);
      const n1 = num(v[1]);
      switch (op) {
        case "eq":
          return n0 != null ? asWhere({ [field]: { equals: n0 } }) : null;
        case "neq":
          return n0 != null ? asWhere({ NOT: { [field]: { equals: n0 } } }) : null;
        case "gt":
          return n0 != null ? asWhere({ [field]: { gt: n0 } }) : null;
        case "lt":
          return n0 != null ? asWhere({ [field]: { lt: n0 } }) : null;
        case "between": {
          const range: Record<string, number> = {};
          if (n0 != null) range.gte = n0;
          if (n1 != null) range.lte = n1;
          return Object.keys(range).length ? asWhere({ [field]: range }) : null;
        }
        case "isEmpty":
          return asWhere({ [field]: null });
        case "isNotEmpty":
          return asWhere({ NOT: { [field]: null } });
        default:
          return null;
      }
    }
    case "date": {
      const d0 = date(v[0]);
      const d1 = date(v[1]);
      switch (op) {
        case "after":
          return d0 ? asWhere({ [field]: { gte: d0 } }) : null;
        case "before":
          return d0 ? asWhere({ [field]: { lte: d0 } }) : null;
        case "between": {
          const range: Record<string, Date> = {};
          if (d0) range.gte = d0;
          if (d1) range.lte = d1;
          return Object.keys(range).length ? asWhere({ [field]: range }) : null;
        }
        case "isEmpty":
          return asWhere({ [field]: null });
        case "isNotEmpty":
          return asWhere({ NOT: { [field]: null } });
        default:
          return null;
      }
    }
    case "bool": {
      switch (op) {
        case "isTrue":
          return asWhere({ [field]: true });
        case "isFalse":
          return asWhere({ [field]: false });
        default:
          return null;
      }
    }
    case "array": {
      const vals = v.map((s) => s.trim()).filter(Boolean);
      switch (op) {
        case "hasAny":
          return vals.length ? asWhere({ [field]: { hasSome: vals } }) : null;
        case "hasNone":
          return vals.length
            ? asWhere({ NOT: { [field]: { hasSome: vals } } })
            : null;
        case "isEmpty":
          return asWhere({ [field]: { isEmpty: true } });
        case "isNotEmpty":
          return asWhere({ [field]: { isEmpty: false } });
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

/** Build the AND-ed clause list for all complete rules in `fb`. */
export function buildFilterBuilderClauses(
  raw: string | null | undefined,
): Prisma.CandidateWhereInput[] {
  const out: Prisma.CandidateWhereInput[] = [];
  for (const rule of decodeRules(raw)) {
    if (!isRuleComplete(rule)) continue;
    const clause = ruleToWhere(rule);
    if (clause) out.push(clause);
  }
  return out;
}
