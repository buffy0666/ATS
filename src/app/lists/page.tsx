import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ListsTable, type ListRow } from "./ListsTable";

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
      jobs: { include: { job: { select: { id: true, title: true } } } },
      assignees: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { members: true } },
    },
  });

  const rows: ListRow[] = lists.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    scope: l.scope,
    ownerLabel: l.ownerId === session.user.id ? "You" : l.owner.name ?? l.owner.email,
    jobs: l.jobs.map((j) => ({ id: j.job.id, title: j.job.title })),
    assignees: l.assignees.map((a) => a.user.name ?? a.user.email),
    memberCount: l._count.members,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));

  return (
    <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Lists</h1>
        <Link
          href="/lists/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          New list
        </Link>
      </div>

      <ListsTable lists={rows} />
    </main>
  );
}
