import {
  CandidateStatus,
  EmploymentType,
  Prisma,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";
import { COLUMN_FILTERS, type ColumnFilterSpec } from "./candidate-columns";
import { decodeFilter, splitRange } from "./column-filter-ops";
import { parseMultiValue, parsePositiveInt } from "./search-params";

/**
 * Shared candidate-list filter logic.
 *
 * Single source of truth for translating the URL search params into a Prisma
 * `where`. Both the list page (pagination) and the "select all matching"
 * server action import this, so the rows you can select are guaranteed to be
 * exactly the rows the filter shows.
 */

export type SearchParamsShape = {
  q?: string;
  status?: string;
  source?: string;
  tag?: string;
  workAuth?: string;
  seniority?: string;
  remotePref?: string;
  employmentType?: string;
  yearsMin?: string;
  yearsMax?: string;
  salaryMin?: string;
  salaryMax?: string;
  hasResume?: string;
  lastContactedDays?: string;
  addedDays?: string;
  page?: string;
  pageSize?: string;
  // --- Exclusion / presence filters (see buildCandidateWhere) ---
  // "is not" mirrors of the multi-select attribute filters (comma-separated;
  // exclude candidates matching ANY chosen value).
  notStatus?: string;
  notSource?: string;
  notTag?: string;
  notWorkAuth?: string;
  notSeniority?: string;
  notRemotePref?: string;
  notEmploymentType?: string;
  // List membership: on ANY of inLists; on NONE of notInLists (comma-sep ids).
  inLists?: string;
  notInLists?: string;
  // Presence: "true" = has, "false" = missing.
  hasEmail?: string;
  hasPhone?: string;
  hasLinkedin?: string;
  // Compliance one-click excludes ("true" activates).
  exDoNotContact?: string;
  exUnsubscribed?: string;
  exBlacklisted?: string;
  exPlaced?: string;
  // Pipeline excludes: not on this job / not in this sequence.
  notOnJob?: string;
  notInSequence?: string;
  // plus arbitrary qcol_<columnKey> quick filters
  [key: string]: string | undefined;
};

export function buildCandidateWhere(sp: SearchParamsShape): Prisma.CandidateWhereInput {
  const where: Prisma.CandidateWhereInput = {};
  const andClauses: Prisma.CandidateWhereInput[] = [];

  const statuses = filterEnumValues(parseMultiValue(sp.status), CandidateStatus);
  if (statuses.length > 0) where.status = { in: statuses };

  const sources = parseMultiValue(sp.source);
  if (sources.length > 0) where.source = { in: sources };

  const tags = parseMultiValue(sp.tag);
  if (tags.length > 0) where.tags = { some: { name: { in: tags } } };

  const workAuths = filterEnumValues(parseMultiValue(sp.workAuth), WorkAuth);
  if (workAuths.length > 0) where.workAuthorization = { in: workAuths };

  const seniorities = parseMultiValue(sp.seniority);
  if (seniorities.length > 0) where.seniority = { in: seniorities };

  const remotes = filterEnumValues(parseMultiValue(sp.remotePref), RemotePref);
  if (remotes.length > 0) where.remotePref = { hasSome: remotes };

  const employments = filterEnumValues(parseMultiValue(sp.employmentType), EmploymentType);
  if (employments.length > 0) where.employmentTypePref = { hasSome: employments };

  const yearsMin = parsePositiveInt(sp.yearsMin);
  const yearsMax = parsePositiveInt(sp.yearsMax);
  if (yearsMin != null || yearsMax != null) {
    where.yearsExperience = {};
    if (yearsMin != null) where.yearsExperience.gte = yearsMin;
    if (yearsMax != null) where.yearsExperience.lte = yearsMax;
  }

  const salaryMin = parsePositiveInt(sp.salaryMin);
  const salaryMax = parsePositiveInt(sp.salaryMax);
  if (salaryMin != null) {
    andClauses.push({
      OR: [
        { desiredSalaryMax: { gte: salaryMin } },
        { AND: [{ desiredSalaryMax: null }, { desiredSalaryMin: { gte: salaryMin } }] },
      ],
    });
  }
  if (salaryMax != null) {
    andClauses.push({
      OR: [
        { desiredSalaryMin: { lte: salaryMax } },
        { AND: [{ desiredSalaryMin: null }, { desiredSalaryMax: { lte: salaryMax } }] },
      ],
    });
  }

  if (sp.hasResume === "true") {
    where.resumeUrl = { not: null };
  }

  const lastContactedDays = parsePositiveInt(sp.lastContactedDays);
  if (lastContactedDays != null) {
    const cutoff = daysAgo(lastContactedDays);
    andClauses.push({
      OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: cutoff } }],
    });
  }

  const addedDays = parsePositiveInt(sp.addedDays);
  if (addedDays != null) {
    where.createdAt = { gte: daysAgo(addedDays) };
  }

  // ---- "is not" exclusions on the multi-select attribute filters ----
  // Independent of the include params so include + exclude can combine.
  // For NULLABLE scalar fields we must OR-in `{ field: null }`, because
  // Postgres `NOT IN (...)` drops NULL rows — otherwise candidates with no
  // value for that field would wrongly vanish.

  const notStatuses = filterEnumValues(parseMultiValue(sp.notStatus), CandidateStatus);
  if (notStatuses.length > 0) {
    // status is non-null → plain notIn is correct.
    andClauses.push({ status: { notIn: notStatuses } });
  }

  const notSources = parseMultiValue(sp.notSource);
  if (notSources.length > 0) {
    andClauses.push({ OR: [{ source: null }, { source: { notIn: notSources } }] });
  }

  const notSeniorities = parseMultiValue(sp.notSeniority);
  if (notSeniorities.length > 0) {
    andClauses.push({ OR: [{ seniority: null }, { seniority: { notIn: notSeniorities } }] });
  }

  const notWorkAuths = filterEnumValues(parseMultiValue(sp.notWorkAuth), WorkAuth);
  if (notWorkAuths.length > 0) {
    andClauses.push({
      OR: [{ workAuthorization: null }, { workAuthorization: { notIn: notWorkAuths } }],
    });
  }

  const notTags = parseMultiValue(sp.notTag);
  if (notTags.length > 0) {
    andClauses.push({ tags: { none: { name: { in: notTags } } } });
  }

  // Array fields: exclude anyone whose array shares any excluded value.
  const notRemotes = filterEnumValues(parseMultiValue(sp.notRemotePref), RemotePref);
  if (notRemotes.length > 0) {
    andClauses.push({ NOT: { remotePref: { hasSome: notRemotes } } });
  }

  const notEmployments = filterEnumValues(
    parseMultiValue(sp.notEmploymentType),
    EmploymentType,
  );
  if (notEmployments.length > 0) {
    andClauses.push({ NOT: { employmentTypePref: { hasSome: notEmployments } } });
  }

  // ---- List membership include / exclude ----
  const inLists = parseMultiValue(sp.inLists);
  if (inLists.length > 0) {
    // On ANY of the chosen lists.
    andClauses.push({ listMemberships: { some: { listId: { in: inLists } } } });
  }
  const notInLists = parseMultiValue(sp.notInLists);
  if (notInLists.length > 0) {
    // On NONE of the chosen lists.
    andClauses.push({ listMemberships: { none: { listId: { in: notInLists } } } });
  }

  // ---- Presence (has / missing) ----
  // email is NON-NULL on Candidate; "missing email" means empty string.
  if (sp.hasEmail === "true") andClauses.push({ NOT: { email: "" } });
  else if (sp.hasEmail === "false") andClauses.push({ email: "" });

  applyPresence(andClauses, "phone", sp.hasPhone);
  applyPresence(andClauses, "linkedinUrl", sp.hasLinkedin);
  // hasResume already handled above as a legacy include; also honor "false".
  if (sp.hasResume === "false") andClauses.push({ resumeUrl: null });

  // ---- Compliance one-click excludes ----
  if (sp.exDoNotContact === "true") {
    andClauses.push({ status: { not: CandidateStatus.DO_NOT_CONTACT } });
  }
  if (sp.exBlacklisted === "true") {
    andClauses.push({ status: { not: CandidateStatus.BLACKLISTED } });
  }
  if (sp.exPlaced === "true") {
    andClauses.push({ status: { not: CandidateStatus.PLACED } });
  }
  if (sp.exUnsubscribed === "true") {
    andClauses.push({ unsubscribedAt: null });
  }

  // ---- Pipeline excludes ----
  const notOnJob = (sp.notOnJob ?? "").trim();
  if (notOnJob) {
    andClauses.push({ applications: { none: { jobId: notOnJob } } });
  }
  const notInSequence = (sp.notInSequence ?? "").trim();
  if (notInSequence) {
    andClauses.push({ enrollments: { none: { sequenceId: notInSequence } } });
  }

  for (const clause of buildQuickColumnFilters(sp)) {
    andClauses.push(clause);
  }

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }
  return where;
}

// Each active per-column filter is `qcol_<columnKey>=<op>:<payload>`. We look
// up the column's filter spec, decode the operator + value, and translate it
// into a Prisma clause appropriate to the column's data type. Bare legacy
// values (no op prefix) decode to the type's default operator, so old saved
// searches keep working.
const ENUM_BY_OPTION: Record<string, Record<string, string>> = {
  "enum:CandidateStatus": CandidateStatus as unknown as Record<string, string>,
  "enum:RemotePref": RemotePref as unknown as Record<string, string>,
  "enum:WorkAuth": WorkAuth as unknown as Record<string, string>,
  "enum:EmploymentType": EmploymentType as unknown as Record<string, string>,
};

function asWhere(o: unknown): Prisma.CandidateWhereInput {
  return o as Prisma.CandidateWhereInput;
}

export function buildQuickColumnFilters(
  sp: Record<string, unknown>,
): Prisma.CandidateWhereInput[] {
  const out: Prisma.CandidateWhereInput[] = [];
  for (const [k, raw] of Object.entries(sp)) {
    if (!k.startsWith("qcol_")) continue;
    if (typeof raw !== "string") continue;
    const colKey = k.slice("qcol_".length);
    const spec = COLUMN_FILTERS[colKey as keyof typeof COLUMN_FILTERS];
    if (!spec) continue;
    const decoded = decodeFilter(spec.type, raw);
    if (!decoded) continue;
    const clause = buildColumnClause(spec, decoded.op, decoded.value);
    if (clause) out.push(clause);
  }
  return out;
}

function buildColumnClause(
  spec: ColumnFilterSpec,
  op: string,
  value: string,
): Prisma.CandidateWhereInput | null {
  switch (spec.type) {
    case "text":
      return textClause(spec, op, value);
    case "choice":
      return choiceClause(spec, op, value);
    case "number":
      return numberClause(spec.field, op, value);
    case "date":
      return dateClause(spec.field, op, value);
    case "presence":
      return presenceClause(spec.field, op);
  }
}

function textClause(
  spec: Extract<ColumnFilterSpec, { type: "text" }>,
  op: string,
  value: string,
): Prisma.CandidateWhereInput | null {
  const f = spec.field;
  const v = value.trim();

  if (f === "__name__") {
    if (!v) return null;
    const ci = "insensitive" as const;
    const ors = [
      { firstName: { contains: v, mode: ci } },
      { lastName: { contains: v, mode: ci } },
    ];
    const eqs = [
      { firstName: { equals: v, mode: ci } },
      { lastName: { equals: v, mode: ci } },
    ];
    switch (op) {
      case "contains":
        return asWhere({ OR: ors });
      case "ncontains":
        return asWhere({ NOT: { OR: ors } });
      case "is":
        return asWhere({ OR: eqs });
      case "nis":
        return asWhere({ NOT: { OR: eqs } });
      default:
        return null; // empty/nempty don't apply — name is always present
    }
  }

  if (spec.relation === "jobTitle") {
    if (!v) return null;
    const match = { job: { title: { contains: v, mode: "insensitive" as const } } };
    switch (op) {
      case "contains":
      case "is":
        return asWhere({ applications: { some: match } });
      case "ncontains":
      case "nis":
        return asWhere({ applications: { none: match } });
      default:
        return null;
    }
  }

  if (spec.array) {
    switch (op) {
      case "contains":
      case "is":
        return v ? asWhere({ [f]: { has: v } }) : null;
      case "ncontains":
      case "nis":
        return v ? asWhere({ NOT: { [f]: { has: v } } }) : null;
      case "empty":
        return asWhere({ [f]: { isEmpty: true } });
      case "nempty":
        return asWhere({ NOT: { [f]: { isEmpty: true } } });
      default:
        return null;
    }
  }

  switch (op) {
    case "contains":
      return v ? asWhere({ [f]: { contains: v, mode: "insensitive" } }) : null;
    case "ncontains":
      return v ? asWhere({ NOT: { [f]: { contains: v, mode: "insensitive" } } }) : null;
    case "is":
      return v ? asWhere({ [f]: { equals: v, mode: "insensitive" } }) : null;
    case "nis":
      return v ? asWhere({ NOT: { [f]: { equals: v, mode: "insensitive" } } }) : null;
    case "empty":
      return asWhere({ OR: [{ [f]: null }, { [f]: "" }] });
    case "nempty":
      return asWhere({ AND: [{ [f]: { not: null } }, { [f]: { not: "" } }] });
    default:
      return null;
  }
}

function choiceClause(
  spec: Extract<ColumnFilterSpec, { type: "choice" }>,
  op: string,
  value: string,
): Prisma.CandidateWhereInput | null {
  let values = parseMultiValue(value);
  const enumObj = ENUM_BY_OPTION[spec.options];
  if (enumObj) values = filterEnumValues(values, enumObj) as string[];
  if (spec.variant === "boolScalar") {
    values = values.filter((v) => v === "true" || v === "false");
  }
  if (values.length === 0) return null;
  const exclude = op === "nin";
  const f = spec.field;

  switch (spec.variant) {
    case "enumScalar":
    case "stringScalar":
      if (exclude) {
        // For nullable scalars, OR-in null — Postgres NOT IN drops NULL rows.
        return spec.nullable
          ? asWhere({ OR: [{ [f]: null }, { [f]: { notIn: values } }] })
          : asWhere({ [f]: { notIn: values } });
      }
      return asWhere({ [f]: { in: values } });
    case "boolScalar": {
      const wantTrue = values.includes("true");
      const wantFalse = values.includes("false");
      if (wantTrue && wantFalse) {
        // Both chosen: "any of" matches everything (no clause); "none of"
        // matches nothing (empty OR is unsatisfiable in Prisma).
        return exclude ? asWhere({ OR: [] }) : null;
      }
      const target = wantTrue;
      return asWhere({ [f]: exclude ? !target : target });
    }
    case "enumArray":
    case "stringArray":
      return exclude
        ? asWhere({ NOT: { [f]: { hasSome: values } } })
        : asWhere({ [f]: { hasSome: values } });
    case "tags":
      return exclude
        ? asWhere({ tags: { none: { name: { in: values } } } })
        : asWhere({ tags: { some: { name: { in: values } } } });
    case "lists":
      return exclude
        ? asWhere({ listMemberships: { none: { list: { name: { in: values } } } } })
        : asWhere({ listMemberships: { some: { list: { name: { in: values } } } } });
    case "client": {
      // Candidate → Application → Job → Client; values are client IDs.
      const match = { job: { clientId: { in: values } } };
      return exclude
        ? asWhere({ applications: { none: match } })
        : asWhere({ applications: { some: match } });
    }
    default:
      return null;
  }
}

function numberClause(field: string, op: string, value: string): Prisma.CandidateWhereInput | null {
  if (op === "empty") return asWhere({ [field]: null });
  if (op === "nempty") return asWhere({ [field]: { not: null } });
  const [minS, maxS] = splitRange(value);
  const min = parsePositiveInt(minS);
  const max = parsePositiveInt(maxS);
  if (min == null && max == null) return null;
  const range: Record<string, number> = {};
  if (min != null) range.gte = min;
  if (max != null) range.lte = max;
  return asWhere({ [field]: range });
}

function dateClause(field: string, op: string, value: string): Prisma.CandidateWhereInput | null {
  if (op === "empty") return asWhere({ [field]: null });
  if (op === "nempty") return asWhere({ [field]: { not: null } });
  const [fromS, toS] = splitRange(value);
  const gte = parseDateStart(fromS);
  const lte = parseDateEnd(toS);
  if (!gte && !lte) return null;
  const range: Record<string, Date> = {};
  if (gte) range.gte = gte;
  if (lte) range.lte = lte;
  return asWhere({ [field]: range });
}

function presenceClause(field: string, op: string): Prisma.CandidateWhereInput | null {
  if (op === "nhas") return asWhere({ OR: [{ [field]: null }, { [field]: "" }] });
  return asWhere({ AND: [{ [field]: { not: null } }, { [field]: { not: "" } }] });
}

/** Parse a "YYYY-MM-DD" string to the start of that day, or null. */
function parseDateStart(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a "YYYY-MM-DD" string to the end of that day (inclusive), or null. */
function parseDateEnd(raw: string | undefined): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Presence helper for nullable scalar fields: "true" = not null, "false" = null.
function applyPresence(
  andClauses: Prisma.CandidateWhereInput[],
  field: "phone" | "linkedinUrl",
  value: string | undefined,
): void {
  if (value === "true") andClauses.push({ [field]: { not: null } } as Prisma.CandidateWhereInput);
  else if (value === "false") andClauses.push({ [field]: null } as Prisma.CandidateWhereInput);
}

export function filterEnumValues<T extends Record<string, string>>(
  values: string[],
  e: T,
): T[keyof T][] {
  const allowed = new Set(Object.values(e));
  return values.filter((v): v is T[keyof T] => allowed.has(v));
}

export function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
