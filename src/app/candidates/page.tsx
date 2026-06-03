import { requireSessionWithOrg } from "@/lib/auth-utils";
import {
  Prisma,
  SavedSearchScope,
} from "@/generated/prisma";
import { hasSearchInput, searchCandidates } from "@/lib/candidate-search";
import { CHOICE_FIELDS, ensureChoiceDefaults, loadChoiceOptions } from "@/lib/choices";
import { prisma } from "@/lib/prisma";
import { CandidatesView, type CandidateRow } from "./CandidatesView";
import type { SavedSearchEntry } from "./SavedSearchesMenu";
import { buildCandidateWhere, type SearchParamsShape } from "./candidate-filter";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const;
const DEFAULT_PAGE_SIZE = 50;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsShape>;
}) {
  const { session, orgId } = await requireSessionWithOrg();
  const sp = await searchParams;

  // Seed default options on first load so the filter dropdowns always have
  // something selectable — this is cheap and idempotent.
  await Promise.all([
    ensureChoiceDefaults(
      CHOICE_FIELDS.candidateSource.key,
      CHOICE_FIELDS.candidateSource.defaults,
      orgId,
    ),
    ensureChoiceDefaults(
      CHOICE_FIELDS.candidateSeniority.key,
      CHOICE_FIELDS.candidateSeniority.defaults,
      orgId,
    ),
  ]);

  // Pagination params from the URL. Defaults aim at "list a small page
  // fast"; max page size capped to PAGE_SIZE_OPTIONS so a user can't
  // request runaway pulls via URL crafting.
  const rawPageSize = Number(sp.pageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
    ? rawPageSize
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const skip = (page - 1) * pageSize;

  // Multi-tenant: scope every read to the caller's org. `where` is built
  // from the URL search params; org filter is unconditional and runs
  // *before* the search-param filters via AND-merging.
  const where: Prisma.CandidateWhereInput = {
    organizationId: orgId,
    ...buildCandidateWhere(sp),
  };

  // Run FTS first so we can intersect candidate IDs with the structured filters.
  // searchCandidates is org-aware: see candidate-search.ts.
  let ftsIds: string[] | null = null;
  if (hasSearchInput(sp.q)) {
    ftsIds = await searchCandidates(sp.q, orgId);
    if (ftsIds && ftsIds.length === 0) {
      // Tsquery ran cleanly but matched nothing — short-circuit.
      const [availableTags, sourceOptions, seniorityOptions] = await Promise.all([
        prisma.tag.findMany({
          where: { organizationId: orgId },
          orderBy: { name: "asc" },
          select: { id: true, name: true, color: true },
        }),
        loadChoiceOptions(CHOICE_FIELDS.candidateSource.key, orgId),
        loadChoiceOptions(CHOICE_FIELDS.candidateSeniority.key, orgId),
      ]);
      return (
        <CandidatesView
          candidates={[]}
          availableTags={availableTags}
          savedSearches={await loadSavedSearches(session.user.id, orgId)}
          currentUserId={session.user.id}
          sourceOptions={sourceOptions.map((o) => ({ id: o.id, name: o.name }))}
          seniorityOptions={seniorityOptions.map((o) => ({ id: o.id, name: o.name }))}
          totalCount={0}
          page={1}
          pageSize={pageSize}
          pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
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

  const [candidates, totalCount, availableTags, savedSearches, sourceOptions, seniorityOptions, listOptions, jobOptions, sequenceOptions] =
    await Promise.all([
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
          listMemberships: {
            select: {
              list: { select: { id: true, name: true } },
            },
          },
          _count: { select: { applications: true } },
        },
        skip,
        take: pageSize,
      }),
      // Total matching the same `where` so the paginator can show the
      // accurate "of N" count and offer the right number of pages.
      prisma.candidate.count({ where }),
      prisma.tag.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      }),
      loadSavedSearches(session.user.id, orgId),
      loadChoiceOptions(CHOICE_FIELDS.candidateSource.key, orgId),
      loadChoiceOptions(CHOICE_FIELDS.candidateSeniority.key, orgId),
      // Option lists for the include/exclude pickers.
      prisma.candidateList.findMany({
        where: {
          organizationId: orgId,
          OR: [{ ownerId: session.user.id }, { scope: "SHARED" }],
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.job.findMany({
        where: { organizationId: orgId },
        orderBy: { title: "asc" },
        select: { id: true, title: true },
        take: 500,
      }),
      prisma.sequence.findMany({
        where: { organizationId: orgId, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
        take: 500,
      }),
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
    lists: c.listMemberships.map((m) => ({
      listId: m.list.id,
      listName: m.list.name,
    })),
  }));

  return (
    <CandidatesView
      candidates={rows}
      availableTags={availableTags}
      savedSearches={savedSearches}
      currentUserId={session.user.id}
      sourceOptions={sourceOptions.map((o) => ({ id: o.id, name: o.name }))}
      seniorityOptions={seniorityOptions.map((o) => ({ id: o.id, name: o.name }))}
      listOptions={listOptions}
      jobOptions={jobOptions}
      sequenceOptions={sequenceOptions}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
    />
  );
}

async function loadSavedSearches(
  userId: string | undefined,
  orgId: string,
): Promise<SavedSearchEntry[]> {
  if (!userId) return [];
  const rows = await prisma.savedSearch.findMany({
    where: {
      organizationId: orgId,
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
