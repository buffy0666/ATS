import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export default async function ListsPage() {
  const { session, orgId } = await requireSessionWithOrg();

  const lists = await prisma.candidateList.findMany({
    where: {
      organizationId: orgId,
      OR: [{ ownerId: session.user.id }, { scope: "SHARED" }],
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { members: true } },
    },
  });

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Lists</h1>
        <Link
          href="/lists/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          New list
        </Link>
      </div>

      {lists.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No lists yet. Create one to bucket candidates for outreach, screening rounds, etc.
        </p>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium text-right">Members</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {lists.map((l) => {
                const isMine = l.ownerId === session.user.id;
                return (
                  <tr
                    key={l.id}
                    className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/lists/${l.id}`} className="font-medium hover:underline">
                        {l.name}
                      </Link>
                      {l.description && (
                        <div className="text-xs text-zinc-500 line-clamp-1">{l.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
                          l.scope === "SHARED"
                            ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {l.scope.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {isMine ? "You" : l.owner.name ?? l.owner.email}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{l._count.members}</td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {l.updatedAt.toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
