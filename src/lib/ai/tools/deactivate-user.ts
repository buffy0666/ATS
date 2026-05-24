import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "./types";

export const deactivateUserTool = defineTool({
  name: "deactivate_user",
  description:
    "Soft-deactivate a user — preserves their historical records (notes, emails, applications) while preventing them from signing in. Admin-only. Use deactivate=false to reactivate.",
  requiresAdmin: true,
  parameters: z.object({
    userId: z.string().min(1).max(40),
    deactivate: z.boolean().default(true),
  }),
  async execute(args, ctx) {
    if (args.userId === ctx.userId && args.deactivate) {
      return { ok: false, error: "You can't deactivate yourself." };
    }
    const user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { id: true, email: true, active: true },
    });
    if (!user) return { ok: false, error: "User not found." };
    if (user.active === !args.deactivate) {
      return {
        ok: true,
        unchanged: true,
        user: { id: user.id, email: user.email, active: user.active },
      };
    }
    const updated = await prisma.user.update({
      where: { id: args.userId },
      data: {
        active: !args.deactivate,
        deactivatedAt: args.deactivate ? new Date() : null,
      },
      select: { id: true, email: true, active: true },
    });
    return { ok: true, user: updated };
  },
});
