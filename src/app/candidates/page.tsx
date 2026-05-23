import { prisma } from "@/lib/prisma";
import { CandidateSource, CandidateStatus, Prisma } from "@/generated/prisma";
import { CandidatesView, type CandidateRow } from "./CandidatesView";

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; tag?: string }>;
}) {
  const sp = await searchParams;

  const where: Prisma.CandidateWhereInput = {};
  if (sp.q && sp.q.trim()) {
    const q = sp.q.trim();
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { currentTitle: { contains: q, mode: "insensitive" } },
      { currentCompany: { contains: q, mode: "insensitive" } },
      { summary: { contains: q, mode: "insensitive" } },
    ];
  }
  if (sp.status && (Object.values(CandidateStatus) as string[]).includes(sp.status)) {
    where.status = sp.status as CandidateStatus;
  }
  if (sp.source && (Object.values(CandidateSource) as string[]).includes(sp.source)) {
    where.source = sp.source as CandidateSource;
  }
  if (sp.tag) {
    where.tags = { some: { name: sp.tag } };
  }

  const [candidates, availableTags] = await Promise.all([
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
  ]);

  const rows: CandidateRow[] = candidates.map((c) => ({
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

  return <CandidatesView candidates={rows} availableTags={availableTags} />;
}
