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
