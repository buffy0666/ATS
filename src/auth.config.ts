import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      const isOnSignup = nextUrl.pathname.startsWith("/signup");
      const isPublicApi = nextUrl.pathname.startsWith("/api/auth");
      const isPublicApply = nextUrl.pathname.startsWith("/apply");
      // /api/external is gated by Bearer token, not session — middleware must not redirect.
      const isExternalApi = nextUrl.pathname.startsWith("/api/external");
      // /api/internal is gated by CRON_SECRET / x-vercel-cron header.
      const isInternalApi = nextUrl.pathname.startsWith("/api/internal");
      if (isPublicApi || isPublicApply || isExternalApi || isInternalApi) return true;
      if (isOnLogin || isOnSignup) {
        // Signed-in users get bounced home — no point re-signing-up.
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      // `user` is only populated on the sign-in / sign-up callback; on
      // subsequent requests we just carry the JWT forward unchanged. That's
      // important to remember: org membership changes won't reflect in the
      // session until the user logs out and back in (or until we add an
      // explicit "refresh session" hook).
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.organizationId = user.organizationId ?? null;
        token.organizationName = user.organizationName ?? null;
        token.isPlatformAdmin = user.isPlatformAdmin ?? false;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as typeof session.user.role;
        session.user.organizationId = (token.organizationId as string | null | undefined) ?? null;
        session.user.organizationName =
          (token.organizationName as string | null | undefined) ?? null;
        session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
