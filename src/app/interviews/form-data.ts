import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Loads candidates / team users / applications-keyed-by-candidate for the
 * InterviewForm. Shared between /interviews/new and /interviews/[id]/edit.
 */
export async function loadFormOptions() {
  const [candidates, teamUsers, applications] = await Promise.all([
    prisma.candidate.findMany({
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true },
      take: 500,
    }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.application.findMany({
      select: {
        id: true,
        candidateId: true,
        job: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const applicationsByCandidate: Record<string, { id: string; jobTitle: string }[]> = {};
  for (const app of applications) {
    if (!applicationsByCandidate[app.candidateId]) {
      applicationsByCandidate[app.candidateId] = [];
    }
    applicationsByCandidate[app.candidateId].push({
      id: app.id,
      jobTitle: app.job.title,
    });
  }

  return { candidates, teamUsers, applicationsByCandidate };
}
