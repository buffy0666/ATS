import { auth } from "@/auth";
import { EnrollmentStatus, Role, TaskStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { SidebarClient } from "./SidebarClient";

export async function Nav() {
  const session = await auth();
  if (!session?.user) return null;

  // Pull the workspace logo separately so the session payload stays small —
  // it's a URL string and Nav is a server component, so this is cheap.
  // Null when the user has no org yet (pre-Phase-4 sessions) or no logo set.
  const orgId = session.user.organizationId;

  // Glanceable badge: the viewer's own tasks due today or overdue (calls,
  // emails, sequence steps included). Excludes paused/canceled sequence tasks.
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [org, taskDueCount] = await Promise.all([
    orgId
      ? prisma.organization.findUnique({ where: { id: orgId }, select: { logoUrl: true } })
      : Promise.resolve(null),
    orgId
      ? prisma.task.count({
          where: {
            organizationId: orgId,
            assignedToId: session.user.id,
            status: { not: TaskStatus.COMPLETE },
            dueDate: { lt: tomorrow },
            OR: [
              { stepRunId: null },
              { stepRun: { enrollment: { status: EnrollmentStatus.ACTIVE } } },
            ],
          },
        })
      : Promise.resolve(0),
  ]);

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
      taskDueCount={taskDueCount}
    />
  );
}
