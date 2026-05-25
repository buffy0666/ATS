import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startImpersonationAction } from "./impersonate-actions";

/**
 * Drill-down view for a single tenant. Read-only for now — sign-in-as
 * and disable-org actions come in Phase 4d.
 */
export default async function PlatformOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      ownerUser: { select: { id: true, email: true, name: true } },
      users: {
        orderBy: [{ active: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          createdAt: true,
          isPlatformAdmin: true,
        },
      },
      _count: {
        select: {
          users: true,
          candidates: true,
          jobs: true,
          clients: true,
          applications: true,
          tasks: true,
          interviews: true,
          sequences: true,
          apiTokens: true,
        },
      },
    },
  });

  if (!org) notFound();

  const aiConfig = await prisma.aIConfig.findUnique({
    where: { organizationId: org.id },
    select: {
      provider: true,
      model: true,
      baseUrl: true,
      timeoutMs: true,
      updatedAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">{org.name}</h2>
          <p className="text-xs text-zinc-500 font-mono">
            {org.slug} · {org.id}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Created {org.createdAt.toLocaleDateString()}
          </p>
        </div>
        <Link
          href="/platform/organizations"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          ← All organizations
        </Link>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Users" value={org._count.users} />
        <Stat label="Clients" value={org._count.clients} />
        <Stat label="Jobs" value={org._count.jobs} />
        <Stat label="Candidates" value={org._count.candidates} />
        <Stat label="Applications" value={org._count.applications} />
        <Stat label="Tasks" value={org._count.tasks} />
        <Stat label="Interviews" value={org._count.interviews} />
        <Stat label="Sequences" value={org._count.sequences} />
        <Stat label="API tokens" value={org._count.apiTokens} />
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold mb-2">Owner</h3>
        {org.ownerUser ? (
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            {org.ownerUser.name ? (
              <>
                {org.ownerUser.name} <span className="text-zinc-500">({org.ownerUser.email})</span>
              </>
            ) : (
              org.ownerUser.email
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            No owner set. This is expected for orgs created by the migration script;
            the first ADMIN promotes themselves to owner on next sign-in (Phase 4
            backfill).
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold mb-3">AI provider</h3>
        {aiConfig ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-zinc-500">Provider</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{aiConfig.provider}</dd>
            <dt className="text-zinc-500">Model</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">{aiConfig.model || "—"}</dd>
            <dt className="text-zinc-500">Base URL</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 font-mono text-xs">
              {aiConfig.baseUrl || "(default)"}
            </dd>
            <dt className="text-zinc-500">Timeout</dt>
            <dd className="text-zinc-900 dark:text-zinc-100">
              {aiConfig.timeoutMs ? `${aiConfig.timeoutMs}ms` : "(default)"}
            </dd>
            <dt className="text-zinc-500">Updated</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-xs">
              {aiConfig.updatedAt.toLocaleString()}
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-zinc-500">
            No AIConfig row — this tenant is using env-var defaults. They should
            configure their own provider in Settings → AI.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-sm font-semibold">Users ({org.users.length})</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            &quot;Sign in as&quot; starts a 30-minute impersonation session, logged in
            ImpersonationSession. Refuses platform admins and deactivated users.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Created</th>
              <th className="text-right px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {org.users.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">
                  {u.email}
                  {u.isPlatformAdmin && (
                    <span
                      title="Platform admin (SaaS operator)"
                      className="ml-2 inline-block rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-[10px] uppercase tracking-wide"
                    >
                      Platform
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                  {u.name ?? "—"}
                </td>
                <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">{u.role}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      u.active
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-zinc-400"
                    }
                  >
                    {u.active ? "Active" : "Deactivated"}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-500 text-xs">
                  {u.createdAt.toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  {u.active && !u.isPlatformAdmin ? (
                    <form action={startImpersonationAction}>
                      <input type="hidden" name="targetUserId" value={u.id} />
                      <button
                        type="submit"
                        className="text-xs rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 px-2 py-1 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                      >
                        Sign in as
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
