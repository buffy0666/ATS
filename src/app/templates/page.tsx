import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export default async function TemplatesPage() {
  const { orgId } = await requireSessionWithOrg();
  const templates = await prisma.emailTemplate.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Email templates</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Shared across the team. Use placeholders like{" "}
            <code className="font-mono text-xs">{"{{candidate.firstName}}"}</code> — they get filled in when you compose.
          </p>
        </div>
        <Link
          href="/templates/new"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          New template
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-zinc-500">No templates yet. Create one to start reusing intros, screen prompts, and rejections.</p>
      ) : (
        <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
          {templates.map((t) => (
            <li key={t.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <Link href={`/templates/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                <div className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">{t.subject}</div>
              </div>
              <div className="text-xs text-zinc-500">
                {t.createdBy?.name ?? t.createdBy?.email ?? "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
