import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CandidatesView, type CandidateRow } from "@/app/candidates/CandidatesView";
import { deleteList } from "../actions";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const list = await prisma.candidateList.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { members: true } },
    },
  });

  if (!list) notFound();
  if (list.scope === "PERSONAL" && list.ownerId !== session.user.id) {
    redirect("/lists?error=not-found");
  }

  const [candidates, availableTags] = await Promise.all([
    prisma.candidate.findMany({
      where: { listMemberships: { some: { listId: id } } },
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

  const isOwner = list.ownerId === session.user.id;

  async function handleDelete() {
    "use server";
    await deleteList(id);
  }

  return (
    <main className="flex-1 max-w-[120rem] mx-auto w-full px-6 py-10">
      <Link href="/lists" className="text-sm text-zinc-500 hover:underline">
        ← All lists
      </Link>
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{list.name}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
            list.scope === "SHARED"
              ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {list.scope.toLowerCase()}
        </span>
        <span className="text-sm text-zinc-500">
          {list._count.members} member{list._count.members === 1 ? "" : "s"} · owned by{" "}
          {isOwner ? "you" : list.owner.name ?? list.owner.email}
        </span>
        {isOwner && (
          <form action={handleDelete} className="ml-auto">
            <button
              type="submit"
              className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              Delete list
            </button>
          </form>
        )}
      </div>

      {list.description && (
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
          {list.description}
        </p>
      )}

      <div className="mt-6">
        <CandidatesView candidates={rows} availableTags={availableTags} listId={list.id} />
      </div>
    </main>
  );
}
