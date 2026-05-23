import Link from "next/link";
import { Nav } from "@/components/Nav";
import { prisma } from "@/lib/prisma";

export default async function Dashboard() {
  const [openJobs, totalCandidates, activeApplications] = await Promise.all([
    prisma.job.count({ where: { status: "OPEN" } }),
    prisma.candidate.count(),
    prisma.application.count({
      where: { stage: { notIn: ["HIRED", "REJECTED"] } },
    }),
  ]);

  return (
    <>
      <Nav />
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
        <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Open jobs" value={openJobs} href="/jobs" />
          <Stat label="Candidates" value={totalCandidates} href="/candidates" />
          <Stat label="Active applications" value={activeApplications} href="/jobs" />
        </div>
      </main>
    </>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
    >
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </Link>
  );
}
