import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";

export default async function UsersPage() {
  // Scope to this org — without it, an admin in tenant A could see
  // every user in tenant B's workspace. requireAdminWithOrg returns the
  // org context we filter on.
  const { orgId } = await requireAdminWithOrg();

  const [users, pendingInvitations] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true, active: true },
    }),
    prisma.invitation.findMany({
      where: {
        organizationId: orgId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        invitedBy: { select: { name: true, email: true } },
      },
    }),
  ]);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Users</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Admins can manage everyone. Recruiters can use the rest of the app.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/users/invite"
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
            >
              Invite teammate
            </Link>
            <Link
              href="/users/new"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              New user (with password)
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                >
                  <td className="px-4 py-3">
                    <Link href={`/users/${u.id}`} className="font-medium hover:underline">
                      {u.email}
                    </Link>
                    {!u.active && (
                      <span className="ml-2 text-xs text-zinc-400">(deactivated)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{u.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {u.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pendingInvitations.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold mb-3">Pending invitations</h2>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Invited by</th>
                    <th className="px-4 py-2 font-medium">Sent</th>
                    <th className="px-4 py-2 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvitations.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-t border-zinc-200 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 font-medium">{inv.email}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
                          {inv.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {inv.invitedBy?.name ?? inv.invitedBy?.email ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {inv.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                        {inv.expiresAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </main>
  );
}
