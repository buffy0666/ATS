import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startImpersonationAction } from "./impersonate-actions";
import { InvitationActionsRow } from "./InvitationActionsRow";

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

  const [aiConfig, invitations] = await Promise.all([
    prisma.aIConfig.findUnique({
      where: { organizationId: org.id },
      select: {
        provider: true,
        model: true,
        baseUrl: true,
        timeoutMs: true,
        updatedAt: true,
      },
    }),
    prisma.invitation.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        invitedBy: { select: { name: true, email: true } },
        acceptedUser: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  // Bucket invitations by lifecycle state. "pending" is the actionable
  // one — we can resend or revoke. "accepted" rows are historical and
  // link to the user that was created. "expired" rows are dead but kept
  // for audit; the platform admin can still resend them, which mints a
  // fresh token under the same email.
  const now = new Date();
  const pendingInvites = invitations.filter(
    (i) => !i.acceptedAt && i.expiresAt > now,
  );
  const acceptedInvites = invitations.filter((i) => i.acceptedAt);
  const expiredInvites = invitations.filter(
    (i) => !i.acceptedAt && i.expiresAt <= now,
  );

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

      <InvitationsSection
        orgId={org.id}
        pending={pendingInvites}
        accepted={acceptedInvites}
        expired={expiredInvites}
      />

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

// ---- Invitations section ------------------------------------------------

type InvitationRow = {
  id: string;
  email: string;
  role: string;
  asOwner: boolean;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  tokenPrefix: string;
  invitedBy: { name: string | null; email: string } | null;
  acceptedUser: { id: string; name: string | null; email: string } | null;
};

function InvitationsSection({
  pending,
  accepted,
  expired,
}: {
  orgId: string;
  pending: InvitationRow[];
  accepted: InvitationRow[];
  expired: InvitationRow[];
}) {
  const total = pending.length + accepted.length + expired.length;
  if (total === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h3 className="text-sm font-semibold">Invitations</h3>
        <p className="text-xs text-zinc-500 mt-1">
          No invitations sent to this organization yet.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-sm font-semibold">Invitations ({total})</h3>
        <p className="text-xs text-zinc-500 mt-0.5">
          Magic-link tokens are sha256-hashed at rest — we can&apos;t show the
          original URL after creation. Use Resend to mint a fresh token and
          invalidate the old one.
        </p>
      </div>

      {pending.length > 0 && (
        <InvitationGroup label="Pending" rows={pending} variant="pending" />
      )}
      {accepted.length > 0 && (
        <InvitationGroup label="Accepted" rows={accepted} variant="accepted" />
      )}
      {expired.length > 0 && (
        <InvitationGroup label="Expired" rows={expired} variant="expired" />
      )}
    </section>
  );
}

function InvitationGroup({
  label,
  rows,
  variant,
}: {
  label: string;
  rows: InvitationRow[];
  variant: "pending" | "accepted" | "expired";
}) {
  const badge =
    variant === "pending"
      ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
      : variant === "accepted"
        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200"
        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400";

  return (
    <div>
      <div className="px-5 py-2 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <span
          className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${badge}`}
        >
          {label}
        </span>
        <span className="text-xs text-zinc-500">{rows.length}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-800/30 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="text-left px-4 py-2">Email</th>
            <th className="text-left px-4 py-2">Role</th>
            <th className="text-left px-4 py-2">Invited by</th>
            <th className="text-left px-4 py-2">Sent</th>
            <th className="text-left px-4 py-2">
              {variant === "accepted" ? "Accepted" : "Expires"}
            </th>
            <th className="text-left px-4 py-2">Token preview</th>
            {variant !== "accepted" && (
              <th className="text-right px-4 py-2">Action</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((inv) => (
            <tr key={inv.id} className="align-top">
              <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100 font-medium">
                {inv.email}
                {inv.asOwner && (
                  <span className="ml-2 inline-block rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    Owner
                  </span>
                )}
                {variant === "accepted" && inv.acceptedUser && (
                  <div className="text-xs text-zinc-500 mt-0.5">
                    → user: {inv.acceptedUser.name ?? inv.acceptedUser.email}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                {inv.role}
              </td>
              <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                {inv.invitedBy
                  ? inv.invitedBy.name ?? inv.invitedBy.email
                  : "—"}
              </td>
              <td className="px-4 py-3 text-zinc-500 text-xs">
                {inv.createdAt.toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-zinc-500 text-xs">
                {variant === "accepted"
                  ? inv.acceptedAt?.toLocaleDateString() ?? "—"
                  : inv.expiresAt.toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-xs font-mono text-zinc-400">
                {inv.tokenPrefix}…
              </td>
              {variant !== "accepted" && (
                <td className="px-4 py-3 text-right">
                  <InvitationActionsRow
                    invitationId={inv.id}
                    isPending={variant === "pending"}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
