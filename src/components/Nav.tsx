import { auth } from "@/auth";
import { Role } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { SidebarClient } from "./SidebarClient";

export async function Nav() {
  const session = await auth();
  if (!session?.user) return null;

  // Pull the workspace logo separately so the session payload stays small —
  // it's a URL string and Nav is a server component, so this is cheap.
  // Null when the user has no org yet (pre-Phase-4 sessions) or no logo set.
  const orgId = session.user.organizationId;
  const org = orgId
    ? await prisma.organization.findUnique({
        where: { id: orgId },
        select: { logoUrl: true },
      })
    : null;

  // Two tiers above recruiter:
  //   isAdmin  = "admin scope" (Branding, Announcements, Tags, Users,
  //              Audit, Knowledge approve) — true for OWNER and ADMIN.
  //   isOwner  = "owner scope" (Custom fields, Choices, AI provider,
  //              org-wide API tokens) — true only for OWNER.
  // SidebarClient hides items that don't fit the active tier.
  const role = session.user.role;
  const isAdmin = role === Role.ADMIN || role === Role.OWNER;
  const isOwner = role === Role.OWNER;

  return (
    <SidebarClient
      email={session.user.email}
      role={role}
      isAdmin={isAdmin}
      isOwner={isOwner}
      isPlatformAdmin={session.user.isPlatformAdmin}
      organizationName={session.user.organizationName ?? null}
      organizationLogoUrl={org?.logoUrl ?? null}
    />
  );
}
