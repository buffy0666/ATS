import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Impersonation library. All the audit-row machinery is here; the JWT
 * overlay that actually flips the session lives in auth.config.ts.
 *
 * Two functions matter:
 *   - startImpersonation(platformAdminId, targetUserId, reason?)
 *   - endImpersonation(sessionId)
 *
 * Callers also use isImpersonationActive(sessionId) on every protected
 * request to make sure the row is still good — if the session was ended
 * (DB), expired (clock), or the target user was deactivated since, we
 * silently fall back to the platform admin's real identity.
 */

/** How long an impersonation session is valid before auto-expiring. */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type StartImpersonationInput = {
  platformAdminUserId: string;
  targetUserId: string;
  reason?: string | null;
};

export type StartImpersonationResult =
  | {
      ok: true;
      session: {
        id: string;
        targetUserId: string;
        targetOrgId: string;
        targetOrgName: string;
        targetRole: string;
        targetEmail: string;
        expiresAt: Date;
      };
    }
  | { ok: false; error: string };

/**
 * Create an impersonation audit row and return the data the JWT layer
 * needs to embed in the platform admin's token. Rejects:
 *   - Self-impersonation
 *   - Impersonating another platform admin (defense in depth)
 *   - Target user that's deactivated
 *   - Target user with no organization (shouldn't happen post-Phase 6,
 *     but we tolerate it during the staged migration with a clear error)
 */
export async function startImpersonation(
  input: StartImpersonationInput,
): Promise<StartImpersonationResult> {
  if (input.platformAdminUserId === input.targetUserId) {
    return { ok: false, error: "You can't impersonate yourself." };
  }

  const target = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: {
      id: true,
      email: true,
      active: true,
      role: true,
      isPlatformAdmin: true,
      organization: { select: { id: true, name: true } },
    },
  });
  if (!target) return { ok: false, error: "Target user not found." };
  if (!target.active) return { ok: false, error: "That user is deactivated." };
  if (target.isPlatformAdmin) {
    return {
      ok: false,
      error: "Refusing to impersonate another platform admin. Use a separate browser profile.",
    };
  }
  if (!target.organization) {
    return {
      ok: false,
      error: "That user has no organization — impersonating them would land you nowhere useful.",
    };
  }

  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MS);
  const session = await prisma.impersonationSession.create({
    data: {
      platformAdminUserId: input.platformAdminUserId,
      targetUserId: target.id,
      targetOrgId: target.organization.id,
      reason: input.reason?.trim() || null,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });

  return {
    ok: true,
    session: {
      id: session.id,
      targetUserId: target.id,
      targetOrgId: target.organization.id,
      targetOrgName: target.organization.name,
      targetRole: target.role,
      targetEmail: target.email,
      expiresAt: session.expiresAt,
    },
  };
}

/**
 * Mark the impersonation session ended. Idempotent — calling twice is a
 * no-op. Returns the session if it existed and belonged to this user.
 */
export async function endImpersonation(args: {
  sessionId: string;
  platformAdminUserId: string;
}) {
  // updateMany so a sessionId from another admin's session just no-ops
  // rather than throwing.
  await prisma.impersonationSession.updateMany({
    where: {
      id: args.sessionId,
      platformAdminUserId: args.platformAdminUserId,
      endedAt: null,
    },
    data: { endedAt: new Date() },
  });
}

/**
 * Cheap status check used by the JWT session callback on every request.
 * Returns null if the session is over (ended, expired, or never existed)
 * — caller should strip the impersonation block from the token in that
 * case so the platform admin is back to their own identity.
 */
export async function isImpersonationActive(sessionId: string): Promise<{
  active: true;
  targetUserId: string;
  targetOrgId: string;
} | null> {
  const row = await prisma.impersonationSession.findUnique({
    where: { id: sessionId },
    select: {
      endedAt: true,
      expiresAt: true,
      targetUserId: true,
      targetOrgId: true,
    },
  });
  if (!row) return null;
  if (row.endedAt) return null;
  if (row.expiresAt < new Date()) return null;
  return {
    active: true,
    targetUserId: row.targetUserId,
    targetOrgId: row.targetOrgId,
  };
}
