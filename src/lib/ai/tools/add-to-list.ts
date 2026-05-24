import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

export const addToListTool = defineTool({
  name: "add_to_list",
  description:
    "Add one or more candidates to an existing list. Already-present candidates are skipped silently. Returns how many were newly added.",
  requiresAdmin: false,
  parameters: z.object({
    listId: z.string().min(1).max(40),
    candidateIds: z.array(z.string().min(1).max(40)).min(1),
  }),
  async execute(args, ctx) {
    const list = await prisma.candidateList.findUnique({
      where: { id: args.listId },
      select: { id: true, name: true, scope: true, ownerId: true },
    });
    if (!list) return { ok: false, error: "List not found." };
    if (list.scope === "PERSONAL" && list.ownerId !== ctx.userId) {
      return { ok: false, error: "Cannot modify someone else's personal list." };
    }

    const ids = Array.from(new Set(args.candidateIds)).slice(0, 500);
    const result = await prisma.candidateListMember.createMany({
      data: ids.map((candidateId) => ({
        listId: list.id,
        candidateId,
        addedById: ctx.userId,
      })),
      skipDuplicates: true,
    });

    return {
      ok: true,
      listId: list.id,
      listName: list.name,
      addedCount: result.count,
      skippedCount: ids.length - result.count,
    };
  },
});
