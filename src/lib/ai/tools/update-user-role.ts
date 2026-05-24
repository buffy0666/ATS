import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma";
import { defineTool } from "./types";

export const updateUserRoleTool = defineTool({
  name: "update_user_role",
  description:
    "Change a user's role (ADMIN or RECRUITER). Admin-only.",
  requiresAdmin: true,
  parameters: z.object({
    userId: z.string().min(1).max(40),
    role: z.nativeEnum(Role),
  }),
  async execute(args, ctx) {
    if (args.userId === ctx.userId && args.role !== Role.ADMIN) {
      return {
        ok: false,
        error: "You can't demote yourself — ask another admin to do it.",
      };
    }
    const before = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { id: true, role: true, email: true },
    });
    if (!before) return { ok: false, error: "User not found." };
    if (before.role === args.role) {
      return { ok: true, unchanged: true, user: before };
    }
    const after = await prisma.user.update({
      where: { id: args.userId },
      data: { role: args.role },
      select: { id: true, email: true, role: true },
    });
    return { ok: true, previousRole: before.role, user: after };
  },
});
