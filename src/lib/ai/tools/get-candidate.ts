import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

export const getCandidateTool = defineTool({
  name: "get_candidate",
  description:
    "Fetch full candidate detail by id — contact info, career snapshot, status, applications, tags, sequences. Use this when the user names a specific candidate or after search_candidates returns an id you need to act on.",
  requiresAdmin: false,
  parameters: z.object({
    candidateId: z.string().min(1).max(40),
  }),
  async execute(args) {
    const candidate = await prisma.candidate.findUnique({
      where: { id: args.candidateId },
      include: {
        tags: { select: { id: true, name: true } },
        applications: {
          select: {
            id: true,
            stage: true,
            updatedAt: true,
            job: { select: { id: true, title: true } },
          },
        },
        enrollments: {
          select: {
            id: true,
            status: true,
            sequence: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!candidate) return { ok: false, error: "Candidate not found." };
    return {
      ok: true,
      candidate: {
        id: candidate.id,
        name: `${candidate.firstName} ${candidate.lastName}`,
        email: candidate.email,
        phone: candidate.phone,
        linkedinUrl: candidate.linkedinUrl,
        location: [candidate.locationCity, candidate.locationState, candidate.locationCountry]
          .filter(Boolean)
          .join(", ") || null,
        currentTitle: candidate.currentTitle,
        currentCompany: candidate.currentCompany,
        yearsExperience: candidate.yearsExperience,
        seniority: candidate.seniority,
        source: candidate.source,
        status: candidate.status,
        rating: candidate.rating,
        summary: candidate.summary,
        notes: candidate.notes,
        tags: candidate.tags.map((t) => t.name),
        applications: candidate.applications.map((a) => ({
          id: a.id,
          jobId: a.job.id,
          jobTitle: a.job.title,
          stage: a.stage,
          updatedAt: a.updatedAt.toISOString(),
        })),
        sequenceEnrollments: candidate.enrollments.map((e) => ({
          id: e.id,
          sequenceId: e.sequence.id,
          sequenceName: e.sequence.name,
          status: e.status,
        })),
      },
    };
  },
});
