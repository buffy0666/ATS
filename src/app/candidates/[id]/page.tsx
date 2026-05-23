import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { prisma } from "@/lib/prisma";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      applications: {
        include: { job: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!candidate) notFound();

  return (
    <>
      <Nav />
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
        <Link href="/candidates" className="text-sm text-zinc-500 hover:underline">
          ← All candidates
        </Link>
        <h1 className="text-2xl font-semibold mt-1">
          {candidate.firstName} {candidate.lastName}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">{candidate.email}</p>

        <section className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Detail label="Phone" value={candidate.phone} />
          <Detail
            label="LinkedIn"
            value={
              candidate.linkedinUrl ? (
                <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  {candidate.linkedinUrl}
                </a>
              ) : null
            }
          />
          <Detail
            label="Resume"
            value={
              candidate.resumeUrl ? (
                <a href={candidate.resumeUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  Download
                </a>
              ) : null
            }
          />
          <Detail label="Added" value={candidate.createdAt.toLocaleDateString()} />
        </section>

        {candidate.notes && (
          <section className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">Notes</h2>
            <p className="whitespace-pre-wrap text-sm">{candidate.notes}</p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">Applications</h2>
          {candidate.applications.length === 0 ? (
            <p className="text-sm text-zinc-500">Not associated with any job yet.</p>
          ) : (
            <ul className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
              {candidate.applications.map((a) => (
                <li key={a.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <Link href={`/jobs/${a.job.id}`} className="font-medium hover:underline">
                    {a.job.title}
                  </Link>
                  <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
                    {a.stage}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-sm">{value || <span className="text-zinc-400">—</span>}</div>
    </div>
  );
}
