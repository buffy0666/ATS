import { type Role } from "@/generated/prisma";
import "next-auth";
import "next-auth/jwt";

/**
 * Shape of an active impersonation overlay carried in the JWT. When
 * present, the session callback substitutes the target user's identity
 * into session.user, and a red banner renders on every page.
 */
export type ImpersonationOverlay = {
  sessionId: string;             // ImpersonationSession.id (audit row)
  targetUserId: string;
  targetEmail: string;
  targetName: string | null;
  targetRole: Role;
  targetOrgId: string;
  targetOrgName: string;
  // Snapshot of the real platform admin so the banner can show "you are
  // [real-name], signed in as [target-name]" without a DB roundtrip.
  realUserId: string;
  realEmail: string;
};

declare module "next-auth" {
  interface User {
    id?: string;
    role?: Role;
    // Multi-tenant: nullable during the staged migration. A user without
    // an org gets bounced to /onboarding/create-organization (Phase 4).
    organizationId?: string | null;
    organizationName?: string | null;
    // SaaS-operator tier — orthogonal to `role`. Set by either the
    // PLATFORM_ADMIN_EMAILS env var (checked on every sign-in) or the
    // promote-platform-admin script.
    isPlatformAdmin?: boolean;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      organizationId: string | null;
      organizationName: string | null;
      isPlatformAdmin: boolean;
    };
    // Present iff the platform admin is currently impersonating a
    // tenant user. Server components use this to render the banner;
    // server actions use it for audit logging and to refuse dangerous
    // operations while impersonating.
    impersonation?: ImpersonationOverlay;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    organizationId?: string | null;
    organizationName?: string | null;
    isPlatformAdmin?: boolean;
    // Impersonation overlay — see ImpersonationOverlay type above.
    impersonation?: ImpersonationOverlay;
  }
}
