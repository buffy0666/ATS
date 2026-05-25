import "server-only";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma";
import { defineTool } from "./types";

export const createUserTool = defineTool({
  name: "create_user",
  description:
    "Create a new user account. Admin-only. The password is bcrypt-hashed before being stored.",
  requiresAdmin: true,
  parameters: z.object({
    email: z.string().email().max(200),
    name: z.string().min(1).max(120).optional(),
    role: z.nativeEnum(Role).default(Role.RECRUITER),
    password: z
      .string()
      .min(10)
      .max(200)
      .describe("Initial password. Must be at least 10 chars; user should change it on first login."),
  }),
  async execute(args, ctx) {
    const existing = await prisma.user.findUnique({
      where: { email: args.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) return { ok: false, error: `A user with email ${args.email} already exists.` };

    const passwordHash = await bcrypt.hash(args.password, 10);
    const user = await prisma.user.create({
      data: {
        email: args.email.toLowerCase(),
        name: args.name ?? null,
        role: args.role,
        passwordHash,
        organizationId: ctx.organizationId,
      },
      select: { id: true, email: true, name: true, role: true },
    });
    return { ok: true, user };
  },
});
