import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ClientStatus } from "@/generated/prisma";
import { defineTool } from "./types";

export const listClientsTool = defineTool({
  name: "list_clients",
  description:
    "List clients with their job and contact counts. Returns up to 50 clients.",
  requiresAdmin: false,
  parameters: z.object({
    status: z
      .array(z.nativeEnum(ClientStatus))
      .optional()
      .describe("Filter to these client statuses. Defaults to ACTIVE + PROSPECT."),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute(args) {
    const statuses =
      args.status && args.status.length > 0
        ? args.status
        : [ClientStatus.ACTIVE, ClientStatus.PROSPECT];
    const clients = await prisma.client.findMany({
      where: { status: { in: statuses } },
      orderBy: { name: "asc" },
      take: args.limit,
      select: {
        id: true,
        name: true,
        industry: true,
        location: true,
        status: true,
        _count: { select: { jobs: true, contacts: true } },
      },
    });
    return {
      total: clients.length,
      results: clients.map((c) => ({
        id: c.id,
        name: c.name,
        industry: c.industry,
        location: c.location,
        status: c.status,
        jobCount: c._count.jobs,
        contactCount: c._count.contacts,
      })),
    };
  },
});
