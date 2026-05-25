import { type Role } from "@/generated/prisma";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id?: string;
    role?: Role;
    // Multi-tenant: nullable during the staged migration. A user without
    // an org gets bounced to /onboarding/create-organization (Phase 4).
    organizationId?: string | null;
    organizationName?: string | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      organizationId: string | null;
      organizationName: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    organizationId?: string | null;
    organizationName?: string | null;
  }
}
