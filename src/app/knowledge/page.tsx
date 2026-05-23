import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { KnowledgeForm } from "./KnowledgeForm";

export default async function KnowledgeBase() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const items = await prisma.knowledgeItem.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
            ← Home
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Knowledge Base</h1>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-medium mb-4">Add Knowledge Item</h2>
        <KnowledgeForm />
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
            <tr>
              <th className="text-left px-6 py-3 font-medium text-zinc-600 dark:text-zinc-400">Name</th>
              <th className="text-left px-6 py-3 font-medium text-zinc-600 dark:text-zinc-400">Type</th>
              <th className="text-left px-6 py-3 font-medium text-zinc-600 dark:text-zinc-400">Link / File</th>
              <th className="text-left px-6 py-3 font-medium text-zinc-600 dark:text-zinc-400">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">
                  No items yet. Add your first document or link above.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/50">
                <td className="px-6 py-4 font-medium">{item.name}</td>
                <td className="px-6 py-4">
                  <span className="inline-block rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-0.5 text-xs uppercase tracking-wide">
                    {item.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {item.url.length > 55 ? item.url.substring(0, 55) + "..." : item.url}
                  </a>
                </td>
                <td className="px-6 py-4 text-zinc-500 text-xs">
                  {new Date(item.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
