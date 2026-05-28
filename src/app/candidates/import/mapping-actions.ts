"use server";

import { createHash } from "node:crypto";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export type SavedMappingPayload = {
  mapping: Record<string, string | null>;
  newFieldDrafts: Record<string, { create: boolean; label: string; type: string }>;
  userMerges: Record<string, Record<string, string>>;
  confirmHigh: Record<string, boolean>;
};

export type SavedMapping = SavedMappingPayload & {
  savedByName: string | null;
  savedAt: string;
};

/**
 * Header-set fingerprint — sha256 over the sorted, lowercased, trimmed
 * headers joined by `|`. Order-insensitive so a CSV exported with a
 * shuffled column order still matches the same saved mapping.
 */
function fingerprintHeaders(headers: string[]): string {
  const norm = headers
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return createHash("sha256").update(norm.join("|")).digest("hex");
}

/** Look up a saved mapping for the current org by header fingerprint. */
export async function loadImportMapping(
  headers: string[],
): Promise<SavedMapping | null> {
  const { orgId } = await requireSessionWithOrg();
  const fp = fingerprintHeaders(headers);
  const row = await prisma.importMapping.findUnique({
    where: { organizationId_headersFingerprint: { organizationId: orgId, headersFingerprint: fp } },
    include: {
      updatedBy: { select: { name: true, email: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;

  const author = row.updatedBy ?? row.createdBy;
  return {
    mapping: row.mapping as SavedMappingPayload["mapping"],
    newFieldDrafts: row.newFieldDrafts as SavedMappingPayload["newFieldDrafts"],
    userMerges: row.userMerges as SavedMappingPayload["userMerges"],
    confirmHigh: row.confirmHigh as SavedMappingPayload["confirmHigh"],
    savedByName: author?.name ?? author?.email ?? null,
    savedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Upsert the saved mapping for this header set + org. Called automatically
 * after a successful import so the next teammate inherits the work.
 */
export async function saveImportMapping(
  headers: string[],
  payload: SavedMappingPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { session, orgId } = await requireSessionWithOrg();
  const userId = session.user.id ?? null;
  if (!userId) return { ok: false, error: "Not signed in." };

  const fp = fingerprintHeaders(headers);
  await prisma.importMapping.upsert({
    where: { organizationId_headersFingerprint: { organizationId: orgId, headersFingerprint: fp } },
    create: {
      organizationId: orgId,
      headersFingerprint: fp,
      mapping: payload.mapping,
      newFieldDrafts: payload.newFieldDrafts,
      userMerges: payload.userMerges,
      confirmHigh: payload.confirmHigh,
      createdById: userId,
      updatedById: userId,
    },
    update: {
      mapping: payload.mapping,
      newFieldDrafts: payload.newFieldDrafts,
      userMerges: payload.userMerges,
      confirmHigh: payload.confirmHigh,
      updatedById: userId,
    },
  });
  return { ok: true };
}

/** Clear the saved mapping for this header set (used by the "Reset" button). */
export async function clearImportMapping(
  headers: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId } = await requireSessionWithOrg();
  const fp = fingerprintHeaders(headers);
  await prisma.importMapping.deleteMany({
    where: { organizationId: orgId, headersFingerprint: fp },
  });
  return { ok: true };
}
