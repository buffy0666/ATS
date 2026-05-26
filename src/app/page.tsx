import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { loadActivityFeed, ActivityFeed } from "./_dashboard/ActivityFeed";
import { loadFollowUpsDue, FollowUpsDueCard } from "./_dashboard/FollowUpsDue";
import { loadGreeting, Greeting } from "./_dashboard/Greeting";
import {
  loadInterviewsToday,
  InterviewsTodayCard,
} from "./_dashboard/InterviewsToday";
import { loadKpiStrip, KpiStrip } from "./_dashboard/KpiStrip";
import {
  loadPipelineFunnel,
  PipelineFunnel,
} from "./_dashboard/PipelineFunnel";
import { QuickActions } from "./_dashboard/QuickActions";
import {
  loadStaleApplications,
  StaleApplicationsCard,
} from "./_dashboard/StaleApplications";
import { loadTasksDue, TasksDueCard } from "./_dashboard/TasksDue";
import { AnnouncementsBanner } from "./_dashboard/AnnouncementsBanner";
import { WorkspaceBanner } from "./_dashboard/WorkspaceBanner";

export default async function Dashboard() {
  const { session, orgId } = await requireSessionWithOrg();
  const userId = session.user.id;

  const [tasks, interviews, followUps, stale, funnel, activity, greeting, kpi, org] =
    await Promise.all([
      loadTasksDue(userId, orgId),
      loadInterviewsToday(userId, orgId),
      loadFollowUpsDue(orgId),
      loadStaleApplications(orgId),
      loadPipelineFunnel(orgId),
      loadActivityFeed(orgId),
      loadGreeting(userId, orgId),
      loadKpiStrip(orgId),
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true, logoUrl: true },
      }),
    ]);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-5">
      {/* Rotating announcements (auto-advance every 10s; arrows + dots). */}
      <AnnouncementsBanner orgId={orgId} />

      {/* Workspace branding — only renders when a logo is uploaded. */}
      <WorkspaceBanner
        logoUrl={org?.logoUrl ?? null}
        organizationName={org?.name ?? null}
      />

      {/* Hero: time-of-day greeting + "what's next" hook */}
      <Greeting data={greeting} />

      {/* Launchpad: four primary new-record shortcuts */}
      <QuickActions />

      {/* KPI strip: business-outcome numbers + 14-day sparklines */}
      <KpiStrip data={kpi} />

      {/* Row 1: what needs my attention */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <TasksDueCard data={tasks} />
        <InterviewsTodayCard data={interviews} />
        <FollowUpsDueCard data={followUps} />
        <StaleApplicationsCard data={stale} />
      </div>

      {/* Row 2: pipeline funnel */}
      <PipelineFunnel data={funnel} />

      {/* Row 3: activity feed */}
      <ActivityFeed data={activity} />
    </main>
  );
}
