import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // Include the org via the relation so the session carries the
        // tenant context without a second query per request. We tolerate
        // a null org during the staged multi-tenant migration — Phase 4
        // adds the /onboarding redirect that catches stranded users.
        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            organization: { select: { id: true, name: true } },
          },
        });
        if (!user) return null;
        if (!user.active) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organization?.id ?? null,
          organizationName: user.organization?.name ?? null,
        };
      },
    }),
  ],
});
