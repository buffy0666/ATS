import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

export const listUsersTool = defineTool({
  name: "list_users",
  description:
    "List all users in the workspace with their role and active state. Admin-only.",
  requiresAdmin: true,
  parameters: z.object({
    includeInactive: z.boolean().default(false),
    limit: z.number().int().min(1).max(200).default(100),
  }),
  async execute(args, ctx) {
    const users = await prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(args.includeInactive ? {} : { active: true }),
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: args.limit,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        deactivatedAt: true,
        createdAt: true,
      },
    });
    return {
      total: users.length,
      results: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        active: u.active,
        deactivatedAt: u.deactivatedAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  },
});
