import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma";
import { defineTool } from "./types";

export const updateUserRoleTool = defineTool({
  name: "update_user_role",
  description:
    "Change a user's role (OWNER, ADMIN, or RECRUITER). Admin-tier callers (ADMIN role) can only assign RECRUITER or ADMIN — promotion to OWNER and editing an existing OWNER's role are restricted to OWNERs. The org must always retain at least one OWNER.",
  requiresAdmin: true,
  parameters: z.object({
    userId: z.string().min(1).max(40),
    role: z.nativeEnum(Role),
  }),
  async execute(args, ctx) {
    const caller = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { role: true },
    });
    const callerIsOwner = caller?.role === Role.OWNER;

    const before = await prisma.user.findFirst({
      where: { id: args.userId, organizationId: ctx.organizationId },
      select: { id: true, role: true, email: true },
    });
    if (!before) return { ok: false, error: "User not found." };

    // ADMIN-tier (non-OWNER) can't promote to OWNER or edit an OWNER.
    if (!callerIsOwner && (args.role === Role.OWNER || before.role === Role.OWNER)) {
      return { ok: false, error: "Only an owner can manage OWNER roles." };
    }

    if (before.role === args.role) {
      return { ok: true, unchanged: true, user: before };
    }

    // Never let the org drop below one OWNER.
    if (before.role === Role.OWNER && args.role !== Role.OWNER) {
      const owners = await prisma.user.count({
        where: { organizationId: ctx.organizationId, role: Role.OWNER },
      });
      if (owners <= 1) {
        return {
          ok: false,
          error: "At least one OWNER must remain in this workspace.",
        };
      }
    }

    const after = await prisma.user.update({
      where: { id: args.userId },
      data: { role: args.role },
      select: { id: true, email: true, role: true },
    });
    return { ok: true, previousRole: before.role, user: after };
  },
});
