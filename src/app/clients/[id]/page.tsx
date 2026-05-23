import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientHeader } from "./ClientHeader";
import { ContactsSection } from "./ContactsSection";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client, owners, allTags] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
        contacts: {
          orderBy: { lastName: "asc" },
          include: { tags: { select: { id: true, name: true, color: true } } },
        },
        owner: { select: { id: true, name: true, email: true } },
        tags: { select: { id: true, name: true, color: true } },
        jobs: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            status: true,
            _count: { select: { applications: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  if (!client) notFound();

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 space-y-8">
      <div>
        <Link href="/clients" className="text-sm text-zinc-500 hover:underline">
          ← All clients
        </Link>
        <ClientHeader client={client} owners={owners} allTags={allTags} />
      </div>

      <ContactsSection clientId={client.id} contacts={client.contacts} allTags={allTags} />

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Jobs for this client ({client.jobs.length})
        </h2>
        {client.jobs.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No jobs yet.{" "}
            <Link href={`/jobs/new?clientId=${client.id}`} className="underline">
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
            {client.jobs.map((j) => (
              <li key={j.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                  {j.title}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 tabular-nums">
                    {j._count.applications} applicant{j._count.applications === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
                    {j.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
