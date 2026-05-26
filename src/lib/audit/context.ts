import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request actor context carried via AsyncLocalStorage so the Prisma
 * extension (and the explicit `recordAuditEvent` helper) can stamp every
 * audit row with `actorUserId / actorEmail / organizationId / ip / ua`
 * without each caller having to pass them around.
 *
 * Populated at the top of every request by the `requireSession*` helpers
 * (the same place we already resolve auth). Callers that don't go through
 * those helpers — login itself, cron jobs, the AI-queue worker — set the
 * context explicitly with `setAuditContext`.
 *
 * Reads are non-throwing: missing context just yields `null` fields, and
 * the audit row records what it can.
 */

export type AuditContext = {
  actorUserId: string | null;
  actorEmail: string | null;
  /** Effective organization the actor is acting against. Null for
   *  platform-scope events (org creation, sign-in itself). */
  organizationId: string | null;
  ip: string | null;
  userAgent: string | null;
  /** When true, the actor is a platform admin currently impersonating a
   *  tenant user — the audit row reflects the impersonating identity. */
  impersonating: boolean;
};

const EMPTY: AuditContext = {
  actorUserId: null,
  actorEmail: null,
  organizationId: null,
  ip: null,
  userAgent: null,
  impersonating: false,
};

const storage = new AsyncLocalStorage<AuditContext>();

/**
 * Sets the audit context for the current async scope. Subsequent Prisma
 * writes within this scope are stamped with these fields. Returns the
 * context so callers can read it back if they need it.
 *
 * Uses `enterWith` so we don't have to wrap the rest of the request in a
 * callback — the helper just enters the store on the existing scope and
 * the value flows downward through awaits.
 */
export function setAuditContext(ctx: Partial<AuditContext>): AuditContext {
  const merged: AuditContext = { ...EMPTY, ...ctx };
  storage.enterWith(merged);
  return merged;
}

/** Returns the current context, or an all-null context if none was set. */
export function getAuditContext(): AuditContext {
  return storage.getStore() ?? EMPTY;
}

/**
 * Run `fn` with the given audit context — useful for background workers
 * that don't have a request scope. Like `setAuditContext` but isolated.
 */
export function runWithAuditContext<T>(ctx: Partial<AuditContext>, fn: () => Promise<T>): Promise<T> {
  return storage.run({ ...EMPTY, ...ctx }, fn);
}
