import { redirect } from "next/navigation";
import Link from "next/link";
import { Role } from "@/generated/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { startAdminImpersonation } from "./actions";

/**
 * Org-scoped "Login as user" picker. Lists active users in the admin's
 * own org (excluding the admin themselves and any platform admins),
 * with a per-row "Login as" button. Reuses the same impersonation
 * machinery as the platform path — the only difference is the actor's
 * permission gate and the visible scope.
 */
export const dynamic = "force-dynamic";

export default async function AdminImpersonatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { session, orgId, orgName } = await requireAdminWithOrg();

  // Defense in depth: if the user is already impersonating someone, the
  // banner is in the way of anything useful — push them home so they can
  // exit first via the banner.
  if (session.impersonation) {
    redirect("/");
  }

  const { error } = await searchParams;

  const users = await prisma.user.findMany({
    where: {
      organizationId: orgId,
      active: true,
      isPlatformAdmin: false,
      NOT: { id: session.user.id },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Login as a user</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Take over another user&apos;s session in <strong>{orgName}</strong> to
          troubleshoot what they see. Every action you take while logged in as
          them is recorded in the audit log under both identities, and the
          session auto-expires after 30 minutes. Refuses to impersonate
          platform admins or your own account.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {decodeURIComponent(error)}
        </div>
      )}

      {users.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No other active users in your organization yet.{" "}
          <Link href="/users/invite" className="text-zinc-700 dark:text-zinc-200 hover:underline">
            Invite one
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {u.name?.trim() || u.email}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {u.email} ·{" "}
                  <span className="uppercase tracking-wide">{roleLabel(u.role)}</span>
                </div>
              </div>
              <form action={startAdminImpersonation} className="shrink-0">
                <input type="hidden" name="targetUserId" value={u.id} />
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium hover:opacity-90"
                >
                  Login as
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function roleLabel(role: Role): string {
  switch (role) {
    case Role.ADMIN:
      return "Admin";
    case Role.RECRUITER:
      return "Recruiter";
    default:
      return role;
  }
}
