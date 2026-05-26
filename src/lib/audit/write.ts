import "server-only";

import type { AuditAction } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getAuditContext } from "./context";
import { buildDiff, snapshotForCreate, snapshotForDelete } from "./diff";
import { entityLabel } from "./entities";

/**
 * Audit-helper trio that wraps the three CRUD shapes. The caller pattern:
 *
 *   const job = await prisma.job.create({ data: {...} });
 *   await auditCreate("Job", job);
 *
 *   const before = await prisma.job.findUnique({ where: { id } });
 *   const after  = await prisma.job.update({ where: { id }, data: {...} });
 *   await auditUpdate("Job", before, after);
 *
 *   const before = await prisma.job.findUnique({ where: { id } });
 *   await prisma.job.delete({ where: { id } });
 *   if (before) await auditDelete("Job", before);
 *
 * All three write to AuditLog using the per-request AsyncLocalStorage
 * context for actor identity + organization scope. Writes never throw —
 * failures are logged and swallowed so a hiccup in audit never breaks the
 * originating mutation.
 */

type AnyRow = Record<string, unknown>;

export async function auditCreate(modelName: string, row: AnyRow): Promise<void> {
  const { changedFields, diff } = snapshotForCreate(row);
  await write("CREATE", modelName, row, changedFields, diff);
}

export async function auditUpdate(
  modelName: string,
  before: AnyRow | null,
  after: AnyRow | null,
): Promise<void> {
  if (!before && !after) return;
  const { changedFields, diff } = buildDiff(before, after);
  if (changedFields.length === 0) return; // no-op update — nothing to log
  const row = after ?? before!;
  await write("UPDATE", modelName, row, changedFields, diff);
}

export async function auditDelete(modelName: string, row: AnyRow): Promise<void> {
  const { changedFields, diff } = snapshotForDelete(row);
  await write("DELETE", modelName, row, changedFields, diff);
}

/**
 * Record a non-CRUD event — login, role change, impersonation, token mint, etc.
 * Maps to the same AuditLog table; entity fields are optional.
 */
export async function auditEvent(params: {
  action: Exclude<AuditAction, "CREATE" | "UPDATE" | "DELETE">;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Override the org from the request context (e.g. platform-cross-tenant actions). */
  organizationId?: string | null;
  /** Override the actor (e.g. system-triggered events). */
  actorUserId?: string | null;
  actorEmail?: string | null;
}): Promise<void> {
  const ctx = getAuditContext();
  try {
    await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        entityLabel: params.entityLabel ?? null,
        metadata: (params.metadata ?? null) as Parameters<
          typeof prisma.auditLog.create
        >[0]["data"]["metadata"],
        actorUserId: params.actorUserId ?? ctx.actorUserId,
        actorEmail: params.actorEmail ?? ctx.actorEmail,
        organizationId: params.organizationId ?? ctx.organizationId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  } catch (err) {
    console.warn(`[audit] failed to record ${params.action}`, err);
  }
}

async function write(
  action: "CREATE" | "UPDATE" | "DELETE",
  modelName: string,
  row: AnyRow,
  changedFields: string[],
  diff: Record<string, { before: unknown; after: unknown; truncated?: string }>,
): Promise<void> {
  const ctx = getAuditContext();
  const rowOrg = typeof row.organizationId === "string" ? row.organizationId : null;
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType: modelName,
        entityId: (row.id as string) ?? null,
        entityLabel: entityLabel(modelName, row),
        changedFields,
        diff: diff as Parameters<typeof prisma.auditLog.create>[0]["data"]["diff"],
        actorUserId: ctx.actorUserId,
        actorEmail: ctx.actorEmail,
        organizationId: rowOrg ?? ctx.organizationId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  } catch (err) {
    console.warn(`[audit] failed to record ${action} ${modelName}`, err);
  }
}
