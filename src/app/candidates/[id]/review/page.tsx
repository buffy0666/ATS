import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ReviewClient, type Candidate } from "./ReviewClient";

/**
 * Review page — focused, one-candidate-at-a-time decision view.
 *
 * `from` URL param controls what "previous" and "next" mean:
 *   - "all" (default) → cycles through all candidates
 *   - "job:<jobId>" → cycles through candidates with an Application on that job
 */
export default async function CandidateReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const fromParam = from ?? "all";

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      tags: { select: { id: true, name: true, color: true } },
      applications: {
        include: { job: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!candidate) notFound();

  // Recent notes — picks up both application-scoped notes and candidate-level
  // notes (those have no application attached).
  const recentNotes = await prisma.note.findMany({
    where: {
      OR: [
        { candidateId: id },
        { application: { candidateId: id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      author: { select: { name: true, email: true } },
      application: {
        select: { id: true, stage: true, job: { select: { title: true } } },
      },
    },
  });

  // Build the sibling sequence based on the `from` context.
  const { ids, position, total } = await getSiblings(id, fromParam);
  const prevId = position > 1 ? ids[position - 2] : null;
  const nextId = position < total ? ids[position] : null;

  const data: Candidate = {
    id: candidate.id,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    preferredName: candidate.preferredName,
    pronouns: candidate.pronouns,
    email: candidate.email,
    phone: candidate.phone,
    linkedinUrl: candidate.linkedinUrl,
    githubUrl: candidate.githubUrl,
    portfolioUrl: candidate.portfolioUrl,
    resumeUrl: candidate.resumeUrl,
    locationCity: candidate.locationCity,
    locationState: candidate.locationState,
    locationCountry: candidate.locationCountry,
    workAuthorization: candidate.workAuthorization,
    requiresSponsorship: candidate.requiresSponsorship,
    currentTitle: candidate.currentTitle,
    currentCompany: candidate.currentCompany,
    yearsExperience: candidate.yearsExperience,
    seniority: candidate.seniority,
    desiredSalaryMin: candidate.desiredSalaryMin,
    desiredSalaryMax: candidate.desiredSalaryMax,
    salaryCurrency: candidate.salaryCurrency,
    remotePref: candidate.remotePref,
    status: candidate.status,
    rating: candidate.rating,
    nextFollowUpAt: candidate.nextFollowUpAt,
    lastContactedAt: candidate.lastContactedAt,
    summary: candidate.summary,
    tags: candidate.tags,
    applications: candidate.applications.map((a) => ({
      id: a.id,
      stage: a.stage,
      job: a.job,
    })),
    recentNotes,
  };

  return (
    <ReviewClient
      candidate={data}
      position={position}
      total={total}
      prevId={prevId}
      nextId={nextId}
      fromParam={fromParam}
    />
  );
}

async function getSiblings(
  currentId: string,
  fromParam: string,
): Promise<{ ids: string[]; position: number; total: number }> {
  if (fromParam.startsWith("job:")) {
    const jobId = fromParam.slice(4);
    const apps = await prisma.application.findMany({
      where: { jobId },
      orderBy: [{ stage: "asc" }, { createdAt: "asc" }],
      select: { candidateId: true },
    });
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const a of apps) {
      if (!seen.has(a.candidateId)) {
        seen.add(a.candidateId);
        ids.push(a.candidateId);
      }
    }
    const idx = ids.indexOf(currentId);
    return {
      ids,
      position: idx >= 0 ? idx + 1 : 1,
      total: ids.length || 1,
    };
  }

  // Default: all candidates by createdAt desc (matches the candidates list default).
  const candidates = await prisma.candidate.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true },
    take: 2000,
  });
  const ids = candidates.map((c) => c.id);
  const idx = ids.indexOf(currentId);
  return {
    ids,
    position: idx >= 0 ? idx + 1 : 1,
    total: ids.length || 1,
  };
}

