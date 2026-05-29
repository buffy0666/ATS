import "server-only";

import { z } from "zod";
import { CandidateStatus, SavedSearchScope } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

/**
 * Persist a SavedSearch ("View") from the assistant's chosen filter set.
 * The returned navigateTo URL is the same shape the candidates page reads
 * — `/candidates?<paramsString>` — so opening it applies the filters
 * fresh against the current candidate set every time (unlike a List,
 * which is a fixed snapshot of ids).
 */
export const createSavedSearchTool = defineTool({
  name: "create_saved_search",
  description:
    'Create a saved candidate search ("View"). A View stores the filter set (keyword query, name, status, tags) and re-applies it every time it\'s opened. Use this when the user wants a refreshable filter — for a fixed snapshot of specific candidate ids, use create_list instead.',
  requiresAdmin: false,
  parameters: z.object({
    name: z.string().min(1).max(120),
    scope: z.nativeEnum(SavedSearchScope).default(SavedSearchScope.PERSONAL),
    query: z.string().max(500).optional().describe("Boolean keyword/FTS query."),
    nameContains: z.string().max(120).optional().describe("Substring against firstName/lastName."),
    status: z.array(z.nativeEnum(CandidateStatus)).optional(),
    tags: z.array(z.string().min(1).max(60)).optional(),
  }),
  async execute(args, ctx) {
    if (!ctx.organizationId) {
      return { error: "No organization context — re-authenticate and try again." };
    }

    const params = new URLSearchParams();
    if (args.query?.trim()) params.set("q", args.query.trim());
    if (args.nameContains?.trim()) params.set("qcol_name", args.nameContains.trim());
    if (args.status && args.status.length > 0) params.set("status", args.status.join(","));
    if (args.tags && args.tags.length > 0) params.set("tag", args.tags.join(","));

    const paramsString = params.toString();
    if (!paramsString) {
      return { error: "Refusing to save an empty View — include at least one filter." };
    }

    const saved = await prisma.savedSearch.create({
      data: {
        name: args.name.trim(),
        scope: args.scope,
        paramsString,
        ownerId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      select: { id: true, name: true },
    });

    return {
      ok: true,
      savedSearchId: saved.id,
      name: saved.name,
      paramsString,
      // The chat panel auto-navigates here when present in a tool result.
      navigateTo: `/candidates?${paramsString}`,
    };
  },
});
