import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      const isPublicApi = nextUrl.pathname.startsWith("/api/auth");
      const isPublicApply = nextUrl.pathname.startsWith("/apply");
      // /api/external is gated by Bearer token, not session — middleware must not redirect.
      const isExternalApi = nextUrl.pathname.startsWith("/api/external");
      // /api/internal is gated by CRON_SECRET / x-vercel-cron header.
      const isInternalApi = nextUrl.pathname.startsWith("/api/internal");
      if (isPublicApi || isPublicApply || isExternalApi || isInternalApi) return true;
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as typeof session.user.role;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
