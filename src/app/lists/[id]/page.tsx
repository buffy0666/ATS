import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CHOICE_FIELDS, loadChoiceOptions } from "@/lib/choices";
import { CandidatesView, type CandidateRow } from "@/app/candidates/CandidatesView";
import { ListHeader } from "./ListHeader";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, orgId } = await requireSessionWithOrg();

  const list = await prisma.candidateList.findFirst({
    where: { id, organizationId: orgId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      jobs: { include: { job: { select: { id: true, title: true } } } },
      assignees: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { members: true } },
    },
  });

  if (!list) notFound();
  if (list.scope === "PERSONAL" && list.ownerId !== session.user.id) {
    redirect("/lists?error=not-found");
  }

  const [candidates, availableTags, sourceOptions, seniorityOptions, allJobs, allUsers] = await Promise.all([
    prisma.candidate.findMany({
      where: {
        organizationId: orgId,
        listMemberships: { some: { listId: id } },
      },
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
      take: 500,
    }),
    prisma.tag.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    loadChoiceOptions(CHOICE_FIELDS.candidateSource.key, orgId),
    loadChoiceOptions(CHOICE_FIELDS.candidateSeniority.key, orgId),
    prisma.job.findMany({
      where: { organizationId: orgId },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
      take: 500,
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, active: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
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
    lists: c.listMemberships.map((m) => ({
      listId: m.list.id,
      listName: m.list.name,
    })),
  }));

  const isOwner = list.ownerId === session.user.id;
  const ownerLabel = isOwner ? "you" : list.owner.name ?? list.owner.email;

  return (
    <main className="flex-1 max-w-[120rem] mx-auto w-full px-6 py-10">
      <Link href="/lists" className="text-sm text-zinc-500 hover:underline">
        ← All lists
      </Link>
      <ListHeader
        list={{
          id: list.id,
          name: list.name,
          description: list.description,
          scope: list.scope,
        }}
        memberCount={list._count.members}
        isOwner={isOwner}
        ownerLabel={ownerLabel}
        selectedJobs={list.jobs.map((j) => ({ id: j.job.id, label: j.job.title }))}
        selectedAssignees={list.assignees.map((a) => ({
          id: a.user.id,
          label: a.user.name ?? a.user.email,
        }))}
        jobOptions={allJobs.map((j) => ({ id: j.id, label: j.title }))}
        userOptions={allUsers.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
      />

      <div className="mt-6">
        <CandidatesView
          candidates={rows}
          availableTags={availableTags}
          listId={list.id}
          sourceOptions={sourceOptions.map((o) => ({ id: o.id, name: o.name }))}
          seniorityOptions={seniorityOptions.map((o) => ({ id: o.id, name: o.name }))}
          originOverride={{
            href: `/lists/${list.id}`,
            label: `List: ${list.name}`,
          }}
        />
      </div>
    </main>
  );
}
