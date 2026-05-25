import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ClientStatus } from "@/generated/prisma";
import { tagClass } from "@/lib/tag-colors";

const STATUS_LABEL: Record<ClientStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  FORMER: "Former",
};

const STATUS_STYLE: Record<ClientStatus, string> = {
  PROSPECT: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  INACTIVE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  FORMER: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export default async function ClientsPage() {
  const { orgId } = await requireSessionWithOrg();
  const clients = await prisma.client.findMany({
    where: { organizationId: orgId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { jobs: true, contacts: true } },
      owner: { select: { name: true, email: true } },
      tags: { select: { id: true, name: true, color: true } },
    },
  });

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Companies you recruit for. Each job is tied to a client.
          </p>
        </div>
        <Link
          href="/clients/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          New client
        </Link>
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-zinc-500">No clients yet. Add your first one.</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Industry</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium text-right">Contacts</th>
                <th className="px-4 py-2 font-medium text-right">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                >
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    {c.location && (
                      <div className="text-xs text-zinc-500">{c.location}</div>
                    )}
                    {c.tags.length > 0 && (
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        {c.tags.map((t) => (
                          <span
                            key={t.id}
                            className={`rounded-full px-1.5 py-0 text-[10px] ${tagClass(t.color)}`}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_STYLE[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{c.industry ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {c.owner?.name ?? c.owner?.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c._count.contacts}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c._count.jobs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
