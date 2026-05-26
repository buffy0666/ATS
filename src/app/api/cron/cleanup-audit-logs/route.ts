import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Daily cron: hard-delete AuditLog rows older than the retention window.
 *
 * Default retention is 365 days (set below). To make this per-tenant
 * later, swap `cutoff` for a per-org lookup against an
 * `Organization.auditRetentionDays` column.
 *
 * Auth: same pattern as the other cron routes —
 *   - `x-vercel-cron: 1` from Vercel cron, OR
 *   - `Authorization: Bearer <CRON_SECRET>` for manual / external invocations.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RETENTION_DAYS = 365;

function isAuthorized(request: NextRequest): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(auth);
  return Boolean(m && m[1] === secret);
}

async function runCleanup() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return Response.json({
    deleted: result.count,
    retentionDays: RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
  });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return runCleanup();
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return runCleanup();
}
