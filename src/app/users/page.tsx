import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-utils";

export default async function UsersPage() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Users</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Admins can manage everyone. Recruiters can use the rest of the app.
            </p>
          </div>
          <Link
            href="/users/new"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            New user
          </Link>
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
    </main>
  );
}
