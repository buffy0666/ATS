import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function JobsPage() {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { applications: true } },
      client: { select: { id: true, name: true } },
    },
  });

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <Link
            href="/jobs/new"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            New job
          </Link>
        </div>

        {jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">No jobs yet. Create the first one.</p>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium text-right">Applicants</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                        {j.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {j.client ? (
                        <Link href={`/clients/${j.client.id}`} className="hover:underline">
                          {j.client.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{j.location ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{j._count.applications}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </main>
  );
}
