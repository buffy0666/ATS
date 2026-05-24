import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasSearchInput, searchCandidates } from "@/lib/candidate-search";
import { CandidateStatus } from "@/generated/prisma";
import { defineTool } from "./types";

export const searchCandidatesTool = defineTool({
  name: "search_candidates",
  description:
    "Find candidates matching a Boolean keyword query (AND/OR/NOT/phrases) and/or structured filters. Returns up to 50 candidates with id, name, email, status, and tags. Use this before any other action that targets candidates.",
  requiresAdmin: false,
  parameters: z.object({
    query: z
      .string()
      .max(500)
      .optional()
      .describe(
        'Boolean keyword query against resume text, summary, skills, and notes — e.g. "react AND (typescript OR next.js) -junior".',
      ),
    status: z
      .array(z.nativeEnum(CandidateStatus))
      .optional()
      .describe("Filter to candidates in any of these statuses."),
    tags: z
      .array(z.string().min(1).max(60))
      .optional()
      .describe("Filter to candidates with any of these tag names."),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute(args) {
    const where: Parameters<typeof prisma.candidate.findMany>[0] = {};
    if (args.status && args.status.length > 0) {
      where.where = { ...where.where, status: { in: args.status } };
    }
    if (args.tags && args.tags.length > 0) {
      where.where = {
        ...where.where,
        tags: { some: { name: { in: args.tags } } },
      };
    }

    let ftsIds: string[] | null = null;
    if (hasSearchInput(args.query)) {
      ftsIds = await searchCandidates(args.query);
      if (ftsIds && ftsIds.length === 0) return { results: [], total: 0 };
      if (ftsIds) {
        where.where = { ...where.where, id: { in: ftsIds } };
      }
    }

    const candidates = await prisma.candidate.findMany({
      where: where.where,
      orderBy: { createdAt: "desc" },
      take: args.limit,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        currentTitle: true,
        currentCompany: true,
        locationCity: true,
        locationState: true,
        tags: { select: { name: true } },
      },
    });

    const ordered = ftsIds
      ? [...candidates].sort((a, b) => ftsIds!.indexOf(a.id) - ftsIds!.indexOf(b.id))
      : candidates;

    return {
      total: ordered.length,
      results: ordered.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`.trim(),
        email: c.email,
        status: c.status,
        currentTitle: c.currentTitle,
        currentCompany: c.currentCompany,
        location: [c.locationCity, c.locationState].filter(Boolean).join(", ") || null,
        tags: c.tags.map((t) => t.name),
      })),
    };
  },
});
