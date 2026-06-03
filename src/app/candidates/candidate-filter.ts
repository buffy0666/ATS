import {
  CandidateStatus,
  EmploymentType,
  Prisma,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";
import { QUICK_FILTER_FIELDS } from "./candidate-columns";
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

export function buildQuickColumnFilters(
  sp: Record<string, unknown>,
): Prisma.CandidateWhereInput[] {
  const out: Prisma.CandidateWhereInput[] = [];
  for (const [k, raw] of Object.entries(sp)) {
    if (!k.startsWith("qcol_")) continue;
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value) continue;
    const colKey = k.slice("qcol_".length);
    const field = QUICK_FILTER_FIELDS[colKey as keyof typeof QUICK_FILTER_FIELDS];
    if (!field) continue;
    if (field === "__name__") {
      out.push({
        OR: [
          { firstName: { contains: value, mode: "insensitive" } },
          { lastName: { contains: value, mode: "insensitive" } },
        ],
      });
    } else {
      out.push({ [field]: { contains: value, mode: "insensitive" } } as Prisma.CandidateWhereInput);
    }
  }
  return out;
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
