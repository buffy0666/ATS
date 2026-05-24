import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

export const getJobTool = defineTool({
  name: "get_job",
  description:
    "Fetch a single job by id with its current applications grouped by stage. Use this when the user references a specific job.",
  requiresAdmin: false,
  parameters: z.object({
    jobId: z.string().min(1).max(40),
  }),
  async execute(args) {
    const job = await prisma.job.findUnique({
      where: { id: args.jobId },
      include: {
        client: { select: { id: true, name: true } },
        applications: {
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: {
            id: true,
            stage: true,
            rating: true,
            updatedAt: true,
            candidate: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
    if (!job) return { ok: false, error: "Job not found." };
    return {
      ok: true,
      job: {
        id: job.id,
        title: job.title,
        department: job.department,
        location: job.location,
        status: job.status,
        description: job.description.slice(0, 2000),
        client: job.client ? { id: job.client.id, name: job.client.name } : null,
        applications: job.applications.map((a) => ({
          id: a.id,
          stage: a.stage,
          rating: a.rating,
          updatedAt: a.updatedAt.toISOString(),
          candidate: {
            id: a.candidate.id,
            name: `${a.candidate.firstName} ${a.candidate.lastName}`,
            email: a.candidate.email,
          },
        })),
      },
    };
  },
});
