import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ListScope } from "@/generated/prisma";
import { defineTool } from "./types";

export const createListTool = defineTool({
  name: "create_list",
  description:
    "Create a new candidate list owned by the current user. Optionally seed it with initial candidate ids. Personal scope by default.",
  requiresAdmin: false,
  parameters: z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    scope: z.nativeEnum(ListScope).default(ListScope.PERSONAL),
    candidateIds: z
      .array(z.string().min(1).max(40))
      .optional()
      .describe("Optional candidates to add right away."),
  }),
  async execute(args, ctx) {
    const list = await prisma.candidateList.create({
      data: {
        name: args.name.trim(),
        description: args.description?.trim() || null,
        scope: args.scope,
        ownerId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      select: { id: true, name: true },
    });

    let added = 0;
    if (args.candidateIds && args.candidateIds.length > 0) {
      const rawIds = Array.from(new Set(args.candidateIds)).slice(0, 500);
      // Defense-in-depth: drop any candidate id that isn't actually in this org.
      const allowed = await prisma.candidate.findMany({
        where: { id: { in: rawIds }, organizationId: ctx.organizationId },
        select: { id: true },
      });
      const ids = allowed.map((c) => c.id);
      const result = await prisma.candidateListMember.createMany({
        data: ids.map((candidateId) => ({
          listId: list.id,
          candidateId,
          addedById: ctx.userId,
        })),
        skipDuplicates: true,
      });
      added = result.count;
    }

    return {
      ok: true,
      listId: list.id,
      listName: list.name,
      addedCount: added,
      // The chat panel auto-navigates to this URL when present.
      navigateTo: `/lists/${list.id}`,
    };
  },
});
