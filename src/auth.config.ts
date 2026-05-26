import type { NextAuthConfig } from "next-auth";
import type { ImpersonationOverlay } from "@/types/next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      const isOnSignup = nextUrl.pathname.startsWith("/signup");
      // /invite/<token> is the magic-link accept page. Reachable unauthed
      // (the token IS the auth). Signed-in users get bounced home —
      // accepting an invite means creating a new user, which conflicts
      // with an existing session.
      const isOnInvite = nextUrl.pathname.startsWith("/invite/");
      const isPublicApi = nextUrl.pathname.startsWith("/api/auth");
      const isPublicApply = nextUrl.pathname.startsWith("/apply");
      // /api/external is gated by Bearer token, not session — middleware must not redirect.
      const isExternalApi = nextUrl.pathname.startsWith("/api/external");
      // /api/internal is gated by CRON_SECRET / x-vercel-cron header.
      const isInternalApi = nextUrl.pathname.startsWith("/api/internal");
      if (isPublicApi || isPublicApply || isExternalApi || isInternalApi) return true;
      if (isOnLogin || isOnSignup || isOnInvite) {
        // Signed-in users get bounced home — no point re-signing-up.
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user, trigger, session }) {
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
      // Server-side `updateSession()` calls from impersonation actions
      // arrive here with trigger="update". The `session` param is whatever
      // the caller passed to updateSession(). We honor two shapes:
      //   { impersonation: ImpersonationOverlay } → set the overlay
      //   { impersonation: null }                  → clear it
      if (trigger === "update" && session && typeof session === "object") {
        const update = session as { impersonation?: ImpersonationOverlay | null };
        if (update.impersonation === null) {
          delete token.impersonation;
        } else if (update.impersonation) {
          token.impersonation = update.impersonation;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (!token || !session.user) return session;

      // Base case: token represents the actual logged-in user. Populate
      // the session from JWT claims.
      session.user.id = token.id as string;
      session.user.role = token.role as typeof session.user.role;
      session.user.organizationId = (token.organizationId as string | null | undefined) ?? null;
      session.user.organizationName =
        (token.organizationName as string | null | undefined) ?? null;
      session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);

      // Impersonation overlay: when set, replace identity-bearing fields
      // with the target user's. The DB validity check (isImpersonationActive)
      // happens in the helpers that gate page access — we do NOT call it
      // here because the session callback runs on every request and
      // shouldn't do a DB roundtrip. The worst case if a stale overlay
      // slips through: the impersonator sees the target's data for up to
      // 30 min (the JWT TTL beyond which expiresAt always wins) until
      // they click "exit" or sign out.
      if (token.impersonation) {
        const i = token.impersonation;
        session.user.id = i.targetUserId;
        session.user.email = i.targetEmail;
        session.user.name = i.targetName;
        session.user.role = i.targetRole;
        session.user.organizationId = i.targetOrgId;
        session.user.organizationName = i.targetOrgName;
        // Impersonator forfeits platform-admin powers WHILE impersonating —
        // they have to exit to get back to /platform routes. This prevents
        // accidentally taking platform-side actions while wearing a tenant
        // user's hat.
        session.user.isPlatformAdmin = false;
        session.impersonation = i;
      }

      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
