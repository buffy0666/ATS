import { requireSessionWithOrg } from "@/lib/auth-utils";
import { loadActivityFeed, ActivityFeed } from "./_dashboard/ActivityFeed";
import { loadFollowUpsDue, FollowUpsDueCard } from "./_dashboard/FollowUpsDue";
import {
  loadInterviewsToday,
  InterviewsTodayCard,
} from "./_dashboard/InterviewsToday";
import {
  loadPipelineFunnel,
  PipelineFunnel,
} from "./_dashboard/PipelineFunnel";
import {
  loadStaleApplications,
  StaleApplicationsCard,
} from "./_dashboard/StaleApplications";
import { loadTasksDue, TasksDueCard } from "./_dashboard/TasksDue";

export default async function Dashboard() {
  const { session, orgId } = await requireSessionWithOrg();
  const userId = session.user.id;

  const [tasks, interviews, followUps, stale, funnel, activity] = await Promise.all([
    loadTasksDue(userId, orgId),
    loadInterviewsToday(userId, orgId),
    loadFollowUpsDue(orgId),
    loadStaleApplications(orgId),
    loadPipelineFunnel(orgId),
    loadActivityFeed(orgId),
  ]);

  const greeting = session.user.name
    ? `Welcome back, ${session.user.name.split(/\s+/)[0]}.`
    : "Welcome back.";

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">{greeting}</p>
      </div>

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
