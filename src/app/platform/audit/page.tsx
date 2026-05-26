import Link from "next/link";
import { type Prisma } from "@/generated/prisma";
import { requirePlatformAdmin } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { AUDITED_MODELS } from "@/lib/audit/entities";
import { AuditTable, type AuditRow } from "../../_audit/AuditTable";
import { applySharedFilters, buildOrderBy } from "../../audit/page";

export const dynamic = "force-dynamic";

type SP = {
  scope?: string; // "all" | <orgId>
  q?: string;
  action?: string;
  entityType?: string;
  field?: string;
  sort?: string;
  dir?: string;
};

const PAGE_SIZE = 100;

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;

  // Always show the chooser at the top so the operator can switch scope
  // without going back. When no scope is set, show the chooser alone
  // (no table) — this is the "What do you want to see?" landing.
  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, isDemo: true },
  });

  const scope = sp.scope ?? null;

  if (!scope) {
    return (
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Platform audit</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Pick a scope. <span className="font-medium">All tenants</span> mixes events from every organization;
            a specific tenant filters the table down to one org.
          </p>
        </div>
        <ScopePicker orgs={orgs} />
      </main>
    );
  }

  const where = buildPlatformWhere(scope, sp);
  const orderBy = buildOrderBy(sp);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy,
      take: PAGE_SIZE,
      include: {
        actorUser: { select: { name: true, email: true } },
        organization: { select: { name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const data: AuditRow[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    action: r.action,
    actorEmail: r.actorEmail ?? r.actorUser?.email ?? null,
    actorName: r.actorUser?.name ?? null,
    entityType: r.entityType,
    entityId: r.entityId,
    entityLabel: r.entityLabel,
    changedFields: r.changedFields,
    organizationName: r.organization?.name ?? null,
    ip: r.ip,
  }));

  const scopedOrg = scope === "all" ? null : orgs.find((o) => o.id === scope);

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-4">
      <div className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Platform audit</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {scope === "all" ? (
              <>Events across <span className="font-medium">all tenants</span>.</>
            ) : scopedOrg ? (
              <>Events for <span className="font-medium">{scopedOrg.name}</span>.</>
            ) : (
              <>Events for tenant <span className="font-mono">{scope}</span>.</>
            )}
          </p>
        </div>
        <Link
          href="/platform/audit"
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Change scope
        </Link>
      </div>

      <AuditTable
        rows={data}
        total={total}
        showOrgColumn={scope === "all"}
        knownEntityTypes={Array.from(AUDITED_MODELS).sort()}
        basePath="/platform/audit"
      />
    </main>
  );
}

function buildPlatformWhere(scope: string, sp: SP): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (scope !== "all") {
    where.organizationId = scope;
  }
  applySharedFilters(where, sp);
  return where;
}

function ScopePicker({
  orgs,
}: {
  orgs: { id: string; name: string; slug: string; isDemo: boolean }[];
}) {
  return (
    <div className="space-y-4">
      <Link
        href="/platform/audit?scope=all"
        className="
          block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5
          transition-all hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-zinc-700
          shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.15)]
        "
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">All tenants</div>
            <div className="text-sm text-zinc-500 mt-0.5">
              Mix events from every organization in one table. Use this for incident response and platform-wide sweeps.
            </div>
          </div>
          <span className="text-2xl text-zinc-300 dark:text-zinc-600">→</span>
        </div>
      </Link>

      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Or pick a tenant</div>
        <ul className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
          {orgs.length === 0 && (
            <li className="px-4 py-6 text-sm text-zinc-500">No organizations yet.</li>
          )}
          {orgs.map((o) => (
            <li key={o.id}>
              <Link
                href={`/platform/audit?scope=${o.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-950"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{o.name}</div>
                  <div className="text-xs text-zinc-500 font-mono truncate">{o.slug}</div>
                </div>
                {o.isDemo && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    Demo
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
