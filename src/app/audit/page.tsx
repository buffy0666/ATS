import { AuditAction, type Prisma } from "@/generated/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { AUDITED_MODELS } from "@/lib/audit/entities";
import { AuditTable, type AuditRow } from "../_audit/AuditTable";

export const dynamic = "force-dynamic";

type SP = {
  q?: string;
  action?: string;        // comma-separated AuditAction values
  entityType?: string;    // comma-separated entity-type names
  field?: string;         // contains-match against changedFields
  sort?: string;
  dir?: string;
};

const PAGE_SIZE = 100;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { orgId } = await requireAdminWithOrg();
  const sp = await searchParams;

  const where = buildWhere(orgId, sp);
  const orderBy = buildOrderBy(sp);

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy,
      take: PAGE_SIZE,
      include: {
        actorUser: { select: { name: true, email: true } },
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
    ip: r.ip,
  }));

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit history</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Every write across your tenant — who changed what, when, and which fields moved. Retained for 365 days.
        </p>
      </div>

      <AuditTable
        rows={data}
        total={total}
        showOrgColumn={false}
        knownEntityTypes={Array.from(AUDITED_MODELS).sort()}
        basePath="/audit"
      />
    </main>
  );
}

function buildWhere(orgId: string, sp: SP): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = { organizationId: orgId };
  applySharedFilters(where, sp);
  return where;
}

export function applySharedFilters(where: Prisma.AuditLogWhereInput, sp: SP): void {
  const q = sp.q?.trim();
  if (q) {
    where.OR = [
      { entityLabel: { contains: q, mode: "insensitive" } },
      { actorEmail: { contains: q, mode: "insensitive" } },
      { entityId: { equals: q } },
    ];
  }
  const actions = parseList(sp.action).filter((a): a is AuditAction =>
    (Object.values(AuditAction) as string[]).includes(a),
  );
  if (actions.length) {
    where.action = { in: actions };
  }
  const entityTypes = parseList(sp.entityType);
  if (entityTypes.length) {
    where.entityType = { in: entityTypes };
  }
  const field = sp.field?.trim();
  if (field) {
    // Postgres array `has` operator: row matches if `field` is in changedFields.
    where.changedFields = { has: field };
  }
}

export function buildOrderBy(sp: SP): Prisma.AuditLogOrderByWithRelationInput {
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  switch (sp.sort) {
    case "action":
      return { action: dir };
    case "entityType":
      return { entityType: dir };
    case "createdAt":
    default:
      return { createdAt: dir };
  }
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
