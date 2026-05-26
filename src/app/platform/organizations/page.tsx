import Link from "next/link";
import { prisma } from "@/lib/prisma";

/**
 * All organizations — searchable. Click through to /platform/organizations/[id]
 * to drill in.
 */
export default async function PlatformOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const orgs = await prisma.organization.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { slug: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      ownerUser: { select: { email: true, name: true } },
      _count: {
        select: {
          users: true,
          candidates: true,
          jobs: true,
          clients: true,
        },
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center justify-between">
        <form className="flex-1 flex gap-2 items-center">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search by name or slug…"
            className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Search
          </button>
          {query && (
            <Link
              href="/platform/organizations"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              Clear
            </Link>
          )}
        </form>
        <Link
          href="/platform/organizations/new"
          className="rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 text-sm font-medium"
        >
          + New tenant
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="text-left px-4 py-2">Organization</th>
              <th className="text-left px-4 py-2">Owner</th>
              <th className="text-right px-4 py-2">Users</th>
              <th className="text-right px-4 py-2">Candidates</th>
              <th className="text-right px-4 py-2">Jobs</th>
              <th className="text-right px-4 py-2">Clients</th>
              <th className="text-left px-4 py-2">Created</th>
              <th className="text-right px-4 py-2 w-32">Login</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {orgs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  {query ? `No organizations matched "${query}".` : "No organizations yet."}
                </td>
              </tr>
            ) : (
              orgs.map((o) => (
                <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                  <td className="px-4 py-2">
                    <Link
                      href={`/platform/organizations/${o.id}`}
                      className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
                    >
                      {o.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{o.slug}</div>
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-300">
                    {o.ownerUser ? (
                      <>
                        <div>{o.ownerUser.name ?? o.ownerUser.email}</div>
                        {o.ownerUser.name && (
                          <div className="text-xs text-zinc-500">{o.ownerUser.email}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{o._count.users}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{o._count.candidates}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{o._count.jobs}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{o._count.clients}</td>
                  <td className="px-4 py-2 text-zinc-500 text-xs">
                    {o.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <LoginDropdown orgId={o.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Showing {orgs.length} {orgs.length === 1 ? "organization" : "organizations"}
        {orgs.length === 200 && " (capped — refine your search to see more)"}.
      </p>
      <p className="text-xs text-zinc-500">
        <strong>Heads up on Login:</strong> opens a new tab with full edit
        powers as the chosen tenant user. Auth cookie is browser-wide, so
        the original tab&apos;s session also flips on next navigation. Click
        the red banner&apos;s &ldquo;Exit impersonation&rdquo; button anywhere to
        return all tabs to your platform-admin identity.
      </p>
    </div>
  );
}

/**
 * Per-row Login dropdown. Uses native <details>/<summary> so it's
 * keyboard-accessible and JS-free. The two options are plain <a> tags
 * with target="_blank" pointing at /platform/impersonate-as — the route
 * handler picks the first active non-platform-admin user of the given
 * role, starts impersonation, and redirects to / in the new tab.
 */
function LoginDropdown({ orgId }: { orgId: string }) {
  return (
    <details className="relative inline-block text-left group">
      <summary className="cursor-pointer list-none rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 text-xs font-medium inline-flex items-center gap-1">
        Login
        <span className="text-[10px] opacity-80">▾</span>
      </summary>
      <div className="absolute right-0 top-full mt-1 w-56 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-20 py-1">
        <a
          href={`/platform/impersonate-as?orgId=${orgId}&role=ADMIN`}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <div className="font-medium">as Tenant Admin</div>
          <div className="text-xs text-zinc-500">
            First active ADMIN. Full settings access.
          </div>
        </a>
        <a
          href={`/platform/impersonate-as?orgId=${orgId}&role=RECRUITER`}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-800"
        >
          <div className="font-medium">as Tenant User</div>
          <div className="text-xs text-zinc-500">
            First active RECRUITER. Standard user view.
          </div>
        </a>
      </div>
    </details>
  );
}
