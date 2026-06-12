import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasSearchInput, searchCandidates } from "@/lib/candidate-search";
import { CandidateStatus, Prisma } from "@/generated/prisma";
import { defineTool } from "./types";

// Light projection returned for each candidate. Kept lean so even a full
// 500-row page stays a reasonable size in the model's context.
const SELECT = {
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
} satisfies Prisma.CandidateSelect;

type Row = Prisma.CandidateGetPayload<{ select: typeof SELECT }>;

/**
 * Opaque pagination token. Encodes the next offset plus a fingerprint of the
 * search arguments, so a cursor minted for one query can't be replayed against
 * a different one (we'd otherwise hand back a wrong/garbled page). The model
 * treats it as opaque — it just passes `nextCursor` back verbatim.
 */
function makeCursor(offset: number, fp: string): string {
  return Buffer.from(JSON.stringify({ o: offset, f: fp })).toString("base64url");
}

function parseCursor(s: string): { o: number; f: string } | null {
  try {
    const obj = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as unknown;
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as { o?: unknown }).o === "number" &&
      Number.isInteger((obj as { o: number }).o) &&
      (obj as { o: number }).o >= 0 &&
      typeof (obj as { f?: unknown }).f === "string"
    ) {
      return { o: (obj as { o: number }).o, f: (obj as { f: string }).f };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Stable fingerprint of the effective filters (order-independent). */
function fingerprint(
  query: string,
  name: string,
  statuses: CandidateStatus[] | undefined,
  tags: string[] | undefined,
): string {
  return JSON.stringify({
    q: query,
    n: name,
    s: [...(statuses ?? [])].sort(),
    t: [...(tags ?? [])].sort(),
  });
}

export const searchCandidatesTool = defineTool({
  name: "search_candidates",
  description:
    "Find candidates matching a Boolean keyword query (AND/OR/NOT/phrases), a name fragment, and/or structured filters. Returns a page of up to 500 candidates (default 50) with id, name, email, status, and tags. The `total` field is the true match count regardless of page size. When more matches exist than the page holds, the response includes a `nextCursor` — call this tool again with that `cursor` (and ALL other arguments identical) to fetch the next page; repeat until `hasMore` is false. This lets you sweep an entire result set, not just the first page. ALWAYS use `nameContains` for questions like \"candidates named X\" or \"how many X are there\" — the keyword query only searches resume/summary text, not the candidate's actual first/last name. Use this before any other action that targets candidates.",
  requiresAdmin: false,
  parameters: z.object({
    query: z
      .string()
      .max(500)
      .optional()
      .describe(
        'Boolean keyword query against resume text, summary, skills, and notes — e.g. "react AND (typescript OR next.js) -junior". Does NOT search the candidate name.',
      ),
    nameContains: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe(
        'Case-insensitive substring match against firstName OR lastName. Use this for "candidates named Andy", "people whose last name starts with K", etc.',
      ),
    status: z
      .array(z.nativeEnum(CandidateStatus))
      .optional()
      .describe("Filter to candidates in any of these statuses."),
    tags: z
      .array(z.string().min(1).max(60))
      .optional()
      .describe("Filter to candidates with any of these tag names."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(50)
      .describe(
        "Max candidates per page (1–500, default 50). Use a high value for bulk actions; combine with `cursor` to page through more than 500.",
      ),
    cursor: z
      .string()
      .max(4000)
      .optional()
      .describe(
        "Opaque pagination token. To fetch the next page, pass the `nextCursor` from the previous response here and keep every other argument identical.",
      ),
  }),
  async execute(args, ctx) {
    if (!ctx.organizationId) {
      return { error: "No organization context — re-authenticate and try again." };
    }
    const orgId = ctx.organizationId;

    // Auto-route: when the model passes a single alphabetic word as `query`
    // (and no `nameContains`), it almost always meant "search by name" —
    // matches the "named X" / "how many X" intent. Treat it as nameContains
    // so we don't FTS across resume text and return hundreds of unrelated rows.
    let queryInput = args.query?.trim() ?? "";
    let nameInput = args.nameContains?.trim() ?? "";
    let autoRoutedNameQuery: string | null = null;
    if (!nameInput && queryInput) {
      const looksLikeName =
        queryInput.length <= 30 &&
        !/\s/.test(queryInput) &&
        /^[A-Za-z][A-Za-z' .-]*$/.test(queryInput);
      if (looksLikeName) {
        nameInput = queryInput;
        autoRoutedNameQuery = queryInput;
        queryInput = "";
      }
    }

    // Base filter shared by both ordering modes (org + status + tags + name).
    const where: Prisma.CandidateWhereInput = { organizationId: orgId };
    if (args.status && args.status.length > 0) {
      where.status = { in: args.status };
    }
    if (args.tags && args.tags.length > 0) {
      where.tags = { some: { name: { in: args.tags } } };
    }
    if (nameInput.length > 0) {
      where.OR = [
        { firstName: { contains: nameInput, mode: "insensitive" } },
        { lastName: { contains: nameInput, mode: "insensitive" } },
      ];
    }

    const limit = args.limit;

    // Resolve the page offset from the cursor (if any). A cursor whose
    // fingerprint doesn't match the current args is rejected so we never
    // return a page from a different search.
    const fp = fingerprint(queryInput, nameInput, args.status, args.tags);
    let offset = 0;
    if (args.cursor) {
      const parsed = parseCursor(args.cursor);
      if (!parsed || parsed.f !== fp) {
        return {
          error:
            "Cursor does not match these search arguments. Omit `cursor` to start a new search, or repeat the exact arguments from the call that produced it.",
        };
      }
      offset = parsed.o;
    }

    let total: number;
    let pageRows: Row[];

    if (hasSearchInput(queryInput)) {
      // FTS mode: searchCandidates returns ids in rank order (best first).
      const ftsIds = await searchCandidates(queryInput, orgId);
      if (!ftsIds || ftsIds.length === 0) {
        return { total: 0, returned: 0, offset, hasMore: false, results: [] };
      }
      // Which of those ids also satisfy the status/tag/name filters, keeping
      // rank order. One light id-only query over the (≤1000) candidate set.
      const allowed = await prisma.candidate.findMany({
        where: { ...where, id: { in: ftsIds } },
        select: { id: true },
      });
      const allowedSet = new Set(allowed.map((r) => r.id));
      const orderedIds = ftsIds.filter((id) => allowedSet.has(id));
      total = orderedIds.length;

      const pageIds = orderedIds.slice(offset, offset + limit);
      const rows = await prisma.candidate.findMany({
        where: { id: { in: pageIds } },
        select: SELECT,
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      pageRows = pageIds.map((id) => byId.get(id)).filter((r): r is Row => Boolean(r));
    } else {
      // Plain mode: newest first, deterministic tie-break on id so offset
      // paging is stable across calls.
      total = await prisma.candidate.count({ where });
      pageRows = await prisma.candidate.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
        select: SELECT,
      });
    }

    const nextOffset = offset + pageRows.length;
    const hasMore = nextOffset < total;
    const nextCursor = hasMore ? makeCursor(nextOffset, fp) : undefined;

    return {
      total,
      returned: pageRows.length,
      offset,
      hasMore,
      ...(nextCursor ? { nextCursor } : {}),
      // Surface the auto-route so the model (and the user) can see we
      // interpreted a bare word like "jason" as a name search.
      ...(autoRoutedNameQuery
        ? {
            note: `Treated query "${autoRoutedNameQuery}" as a name search (firstName/lastName contains). Pass nameContains explicitly to suppress this fallback, or pass a multi-word/Boolean query to force keyword search.`,
          }
        : {}),
      results: pageRows.map((c) => ({
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
