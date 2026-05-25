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

/**
 * Comma-separated list of email addresses that should be treated as
 * platform admins regardless of the DB flag. Lets the SaaS operator
 * bootstrap themselves without poking the database.
 *
 * Example env: PLATFORM_ADMIN_EMAILS="andy@example.com,co-founder@example.com"
 */
function matchesPlatformAdminEnv(email: string): boolean {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  if (!raw) return false;
  const allow = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

// `unstable_update` is NextAuth v5's official way to mutate the JWT
// server-side. We use it from the impersonation server actions to push
// the impersonation overlay into the platform admin's session token.
// Name's "unstable" but it's the documented path — re-export under a
// friendlier name for our app.
export const { handlers, auth, signIn, signOut, unstable_update: updateSession } = NextAuth({
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

        // Bootstrap path for the platform admin tier. The
        // PLATFORM_ADMIN_EMAILS env var is the source of truth on every
        // sign-in — that way a database write that strips the flag (or a
        // botched migration) can't lock the SaaS operator out. We also
        // persist the flag back to the DB so the rest of the app's
        // server-side checks can rely on User.isPlatformAdmin without
        // re-reading env vars.
        const isPlatformAdmin =
          user.isPlatformAdmin || matchesPlatformAdminEnv(user.email);
        if (isPlatformAdmin && !user.isPlatformAdmin) {
          await prisma.user
            .update({ where: { id: user.id }, data: { isPlatformAdmin: true } })
            .catch(() => {
              // Non-fatal — env var still wins this session.
            });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organization?.id ?? null,
          organizationName: user.organization?.name ?? null,
          isPlatformAdmin,
        };
      },
    }),
  ],
});
