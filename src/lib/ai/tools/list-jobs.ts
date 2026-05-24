import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { JobStatus } from "@/generated/prisma";
import { defineTool } from "./types";

export const listJobsTool = defineTool({
  name: "list_jobs",
  description:
    "List jobs with their applicant counts. Filter by status (default OPEN). Returns up to 50 jobs.",
  requiresAdmin: false,
  parameters: z.object({
    status: z
      .array(z.nativeEnum(JobStatus))
      .optional()
      .describe("Filter to these job statuses. Defaults to [OPEN]."),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute(args) {
    const statuses = args.status && args.status.length > 0 ? args.status : [JobStatus.OPEN];
    const jobs = await prisma.job.findMany({
      where: { status: { in: statuses } },
      orderBy: { updatedAt: "desc" },
      take: args.limit,
      select: {
        id: true,
        title: true,
        department: true,
        location: true,
        status: true,
        client: { select: { id: true, name: true } },
        _count: { select: { applications: true } },
      },
    });
    return {
      total: jobs.length,
      results: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        department: j.department,
        location: j.location,
        status: j.status,
        client: j.client ? { id: j.client.id, name: j.client.name } : null,
        applicantCount: j._count.applications,
      })),
    };
  },
});
