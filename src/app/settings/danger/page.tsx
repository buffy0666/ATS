import { requireOwnerWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DeleteWorkspace } from "./DeleteWorkspace";

export const metadata = { title: "Danger zone — Settings" };

/**
 * Owner-only Danger zone. Currently hosts workspace deletion; gated by
 * requireOwnerWithOrg so ADMIN/RECRUITER never reach it (the settings nav
 * also only shows this tab to owners).
 */
export default async function DangerZonePage() {
  const { orgId, orgName } = await requireOwnerWithOrg();

  // Pull the canonical name from the DB (not the possibly-stale session) so it
  // matches exactly what the delete action re-checks the typed value against.
  const [org, users, candidates, jobs, clients, applications, interviews] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    prisma.user.count({ where: { organizationId: orgId } }),
    prisma.candidate.count({ where: { organizationId: orgId } }),
    prisma.job.count({ where: { organizationId: orgId } }),
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.application.count({ where: { organizationId: orgId } }),
    prisma.interview.count({ where: { organizationId: orgId } }),
  ]);

  const name = org?.name ?? orgName ?? "this workspace";

  const impact = [
    { label: "Team members", count: users },
    { label: "Candidates", count: candidates },
    { label: "Jobs", count: jobs },
    { label: "Clients", count: clients },
    { label: "Applications", count: applications },
    { label: "Interviews", count: interviews },
  ];

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Irreversible, destructive actions for this workspace. Only owners can see this page.
      </p>
      <DeleteWorkspace orgName={name} impact={impact} />
    </div>
  );
}
