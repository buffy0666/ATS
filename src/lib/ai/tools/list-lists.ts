import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

export const listListsTool = defineTool({
  name: "list_lists",
  description:
    "List candidate lists visible to the current user — their personal lists + every shared list. Returns up to 50.",
  requiresAdmin: false,
  parameters: z.object({
    limit: z.number().int().min(1).max(50).default(25),
  }),
  async execute(args, ctx) {
    const lists = await prisma.candidateList.findMany({
      where: {
        OR: [{ ownerId: ctx.userId }, { scope: "SHARED" }],
      },
      orderBy: [{ updatedAt: "desc" }],
      take: args.limit,
      select: {
        id: true,
        name: true,
        description: true,
        scope: true,
        ownerId: true,
        owner: { select: { name: true, email: true } },
        _count: { select: { members: true } },
      },
    });
    return {
      total: lists.length,
      results: lists.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        scope: l.scope,
        owner: l.ownerId === ctx.userId ? "you" : l.owner.name ?? l.owner.email,
        memberCount: l._count.members,
      })),
    };
  },
});
