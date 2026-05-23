import { auth } from "@/auth";
import {
  CandidateSource,
  CandidateStatus,
  EmploymentType,
  Prisma,
  RemotePref,
  SavedSearchScope,
  Seniority,
  WorkAuth,
} from "@/generated/prisma";
import { hasSearchInput, searchCandidates } from "@/lib/candidate-search";
import { prisma } from "@/lib/prisma";
import { CandidatesView, type CandidateRow } from "./CandidatesView";
import type { SavedSearchEntry } from "./SavedSearchesMenu";
import { parseMultiValue, parsePositiveInt } from "./search-params";

type SearchParamsShape = {
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
};

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsShape>;
}) {
  const session = await auth();
  const sp = await searchParams;

  const where = buildCandidateWhere(sp);

  // Run FTS first so we can intersect candidate IDs with the structured filters.
  let ftsIds: string[] | null = null;
  if (hasSearchInput(sp.q)) {
    ftsIds = await searchCandidates(sp.q);
    if (ftsIds && ftsIds.length === 0) {
      // Tsquery ran cleanly but matched nothing — short-circuit.
      const availableTags = await prisma.tag.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      });
      return (
        <CandidatesView
          candidates={[]}
          availableTags={availableTags}
          savedSearches={await loadSavedSearches(session?.user?.id)}
          currentUserId={session?.user?.id ?? ""}
        />
      );
    }
    if (ftsIds) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { id: { in: ftsIds } },
      ];
    }
  }

  const [candidates, availableTags, savedSearches] = await Promise.all([
    prisma.candidate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        tags: { select: { id: true, name: true, color: true } },
        applications: {
          select: {
            id: true,
            stage: true,
            job: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { applications: true } },
      },
      take: 500,
    }),
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    loadSavedSearches(session?.user?.id),
  ]);

  // If we ran FTS, re-sort by relevance order (the IDs come back ranked from
  // ts_rank); otherwise leave the createdAt-desc order from findMany.
  const ordered = ftsIds
    ? [...candidates].sort(
        (a, b) => ftsIds!.indexOf(a.id) - ftsIds!.indexOf(b.id),
      )
    : candidates;

  const rows: CandidateRow[] = ordered.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    alternateEmail: c.alternateEmail,
    alternatePhone: c.alternatePhone,
    status: c.status,
    rating: c.rating,
    locationCity: c.locationCity,
    locationState: c.locationState,
    locationCountry: c.locationCountry,
    timezone: c.timezone,
    willingToRelocate: c.willingToRelocate,
    currentTitle: c.currentTitle,
    currentCompany: c.currentCompany,
    yearsExperience: c.yearsExperience,
    seniority: c.seniority,
    workAuthorization: c.workAuthorization,
    requiresSponsorship: c.requiresSponsorship,
    desiredSalaryMin: c.desiredSalaryMin,
    desiredSalaryMax: c.desiredSalaryMax,
    currentSalary: c.currentSalary,
    salaryCurrency: c.salaryCurrency,
    availableFrom: c.availableFrom,
    noticePeriodDays: c.noticePeriodDays,
    employmentTypePref: c.employmentTypePref,
    remotePref: c.remotePref,
    industries: c.industries,
    specialties: c.specialties,
    source: c.source,
    sourceDetail: c.sourceDetail,
    lastContactedAt: c.lastContactedAt,
    nextFollowUpAt: c.nextFollowUpAt,
    linkedinUrl: c.linkedinUrl,
    githubUrl: c.githubUrl,
    portfolioUrl: c.portfolioUrl,
    resumeUrl: c.resumeUrl,
    summary: c.summary,
    createdAt: c.createdAt,
    tags: c.tags,
    applicationCount: c._count.applications,
    jobs: c.applications.map((a) => ({
      applicationId: a.id,
      jobId: a.job.id,
      jobTitle: a.job.title,
      stage: a.stage,
    })),
  }));

  return (
    <CandidatesView
      candidates={rows}
      availableTags={availableTags}
      savedSearches={savedSearches}
      currentUserId={session?.user?.id ?? ""}
    />
  );
}

async function loadSavedSearches(userId: string | undefined): Promise<SavedSearchEntry[]> {
  if (!userId) return [];
  const rows = await prisma.savedSearch.findMany({
    where: {
      OR: [{ ownerId: userId }, { scope: SavedSearchScope.SHARED }],
    },
    orderBy: { name: "asc" },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    paramsString: r.paramsString,
    scope: r.scope,
    ownerId: r.ownerId,
    ownerName: r.owner.name,
    ownerEmail: r.owner.email,
  }));
}

function buildCandidateWhere(sp: SearchParamsShape): Prisma.CandidateWhereInput {
  const where: Prisma.CandidateWhereInput = {};
  const andClauses: Prisma.CandidateWhereInput[] = [];

  const statuses = filterEnumValues(parseMultiValue(sp.status), CandidateStatus);
  if (statuses.length > 0) where.status = { in: statuses };

  const sources = filterEnumValues(parseMultiValue(sp.source), CandidateSource);
  if (sources.length > 0) where.source = { in: sources };

  const tags = parseMultiValue(sp.tag);
  if (tags.length > 0) where.tags = { some: { name: { in: tags } } };

  const workAuths = filterEnumValues(parseMultiValue(sp.workAuth), WorkAuth);
  if (workAuths.length > 0) where.workAuthorization = { in: workAuths };

  const seniorities = filterEnumValues(parseMultiValue(sp.seniority), Seniority);
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
    // Candidate willing to work for at least this much — their max accepts it,
    // or (if no max set) their min is >= filterMin.
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

  if (andClauses.length > 0) {
    where.AND = andClauses;
  }
  return where;
}

function filterEnumValues<T extends Record<string, string>>(
  values: string[],
  e: T,
): T[keyof T][] {
  const allowed = new Set(Object.values(e));
  return values.filter((v): v is T[keyof T] => allowed.has(v));
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
