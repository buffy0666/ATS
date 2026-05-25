import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tagColorForName } from "@/lib/tag-colors";
import { defineTool } from "./types";

export const tagCandidatesTool = defineTool({
  name: "tag_candidates",
  description:
    "Attach one or more tags to one or more candidates. New tag names are created on the fly with a deterministic color.",
  requiresAdmin: false,
  parameters: z.object({
    candidateIds: z.array(z.string().min(1).max(40)).min(1),
    tagNames: z.array(z.string().min(1).max(60)).min(1),
  }),
  async execute(args, ctx) {
    const rawIds = Array.from(new Set(args.candidateIds)).slice(0, 500);
    const names = Array.from(new Set(args.tagNames.map((n) => n.trim()).filter(Boolean)));
    if (rawIds.length === 0 || names.length === 0) {
      return { ok: false, error: "Need at least one candidate id and one tag name." };
    }

    // Only allow tagging candidates in the caller's org.
    const allowed = await prisma.candidate.findMany({
      where: { id: { in: rawIds }, organizationId: ctx.organizationId },
      select: { id: true },
    });
    const ids = allowed.map((c) => c.id);
    if (ids.length === 0) {
      return { ok: false, error: "No matching candidates in your workspace." };
    }

    // Tag.name is globally unique today (Phase 6 makes it per-org). The
    // upsert still works pre-lockdown; just keep the row's organizationId
    // in sync with the caller on insert.
    const tags = await Promise.all(
      names.map((name) =>
        prisma.tag.upsert({
          where: { name },
          create: { name, color: tagColorForName(name), organizationId: ctx.organizationId },
          update: {},
          select: { id: true, name: true },
        }),
      ),
    );
    const tagConnect = tags.map((t) => ({ id: t.id }));

    await prisma.$transaction(
      ids.map((id) =>
        prisma.candidate.update({
          where: { id },
          data: { tags: { connect: tagConnect } },
        }),
      ),
    );

    return {
      ok: true,
      taggedCount: ids.length,
      tags: tags.map((t) => t.name),
    };
  },
});
