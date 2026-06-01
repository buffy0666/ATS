import Link from "next/link";
import { notFound } from "next/navigation";
import { Prisma, type Stage } from "@/generated/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { MERGE_FIELDS, type MergeFieldKind } from "./fields";
import { MergeClient, type CandidateSummary, type FieldRow, type AppConflict } from "./MergeClient";

const COMPARE_INCLUDE = {
  applications: {
    select: { id: true, jobId: true, stage: true, job: { select: { title: true } } },
  },
  tags: { select: { id: true } },
  eeo: { select: { id: true } },
  _count: {
    select: {
      noteThreads: true,
      emails: true,
      contactLogs: true,
      applications: true,
      interviews: true,
      enrollments: true,
      listMemberships: true,
      documents: true,
      references: true,
      activities: true,
      tags: true,
    },
  },
} satisfies Prisma.CandidateInclude;

type LoadedCandidate = Prisma.CandidateGetPayload<{ include: typeof COMPARE_INCLUDE }>;

function label(c: { firstName: string; lastName: string; email: string }): string {
  return `${c.firstName} ${c.lastName}`.trim() || c.email;
}

/** Display string + emptiness for a single field value. */
function describe(kind: MergeFieldKind, raw: unknown): { display: string | null; empty: boolean } {
  if (raw == null) return { display: null, empty: true };
  switch (kind) {
    case "bool":
      return { display: raw ? "Yes" : "No", empty: false };
    case "number":
      return { display: String(raw), empty: false };
    case "date": {
      const d = raw as Date;
      return { display: d.toLocaleDateString(), empty: false };
    }
    case "array": {
      const arr = raw as unknown[];
      if (!Array.isArray(arr) || arr.length === 0) return { display: null, empty: true };
      return { display: arr.join(", "), empty: false };
    }
    case "json": {
      if (Array.isArray(raw)) {
        const n = raw.length;
        return n === 0
          ? { display: null, empty: true }
          : { display: `${n} ${n === 1 ? "entry" : "entries"}`, empty: false };
      }
      return { display: "Present", empty: false };
    }
    default: {
      const s = String(raw);
      return s.trim() ? { display: s, empty: false } : { display: null, empty: true };
    }
  }
}

function rawEqual(kind: MergeFieldKind, a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (kind === "date") return (a as Date).getTime() === (b as Date).getTime();
  if (kind === "array" || kind === "json") return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

function summarize(c: LoadedCandidate, completeness: number): CandidateSummary {
  return {
    id: c.id,
    label: label(c),
    email: c.email,
    createdAtIso: c.createdAt.toISOString(),
    createdAtDisplay: c.createdAt.toLocaleDateString(),
    completeness,
    hasEeo: c.eeo != null,
    counts: {
      notes: c._count.noteThreads,
      emails: c._count.emails,
      contactLogs: c._count.contactLogs,
      applications: c._count.applications,
      interviews: c._count.interviews,
      enrollments: c._count.enrollments,
      listMemberships: c._count.listMemberships,
      documents: c._count.documents,
      references: c._count.references,
      activities: c._count.activities,
      tags: c._count.tags,
    },
  };
}

export default async function MergeCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { orgId } = await requireAdminWithOrg();
  const { a, b } = await searchParams;

  if (!a || !b || a === b) notFound();

  const [candA, candB] = await Promise.all([
    prisma.candidate.findFirst({ where: { id: a, organizationId: orgId }, include: COMPARE_INCLUDE }),
    prisma.candidate.findFirst({ where: { id: b, organizationId: orgId }, include: COMPARE_INCLUDE }),
  ]);

  if (!candA || !candB) notFound();

  // Build the per-field comparison rows and tally completeness in one pass.
  let completenessA = 0;
  let completenessB = 0;
  const fields: FieldRow[] = MERGE_FIELDS.map((f) => {
    const rawA = (candA as Record<string, unknown>)[f.key];
    const rawB = (candB as Record<string, unknown>)[f.key];
    const da = describe(f.kind, rawA);
    const db = describe(f.kind, rawB);
    if (!da.empty) completenessA++;
    if (!db.empty) completenessB++;
    const differ = da.empty && db.empty ? false : da.empty !== db.empty ? true : !rawEqual(f.kind, rawA, rawB);
    return {
      key: f.key,
      label: f.label,
      group: f.group,
      kind: f.kind,
      a: da.display,
      b: db.display,
      aEmpty: da.empty,
      bEmpty: db.empty,
      differ,
    };
  });

  // Application conflicts: jobs both candidates applied to.
  const appAByJob = new Map(candA.applications.map((ap) => [ap.jobId, ap]));
  const conflicts: AppConflict[] = candB.applications
    .filter((ap) => appAByJob.has(ap.jobId))
    .map((apB) => {
      const apA = appAByJob.get(apB.jobId)!;
      return {
        jobId: apB.jobId,
        jobTitle: apA.job?.title ?? "Untitled job",
        aStage: apA.stage as Stage,
        bStage: apB.stage as Stage,
      };
    });

  // Default the primary to the more-complete record; tie → older one.
  const defaultPrimary: "a" | "b" =
    completenessA !== completenessB
      ? completenessA > completenessB
        ? "a"
        : "b"
      : candA.createdAt.getTime() <= candB.createdAt.getTime()
        ? "a"
        : "b";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <Link href="/candidates" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← Back to candidates
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Merge candidates</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Combine two duplicate records into one. The primary record survives; the other is
          permanently deleted once its data has been merged in.
        </p>
      </div>

      <MergeClient
        a={summarize(candA, completenessA)}
        b={summarize(candB, completenessB)}
        fields={fields}
        conflicts={conflicts}
        defaultPrimary={defaultPrimary}
      />
    </main>
  );
}
