import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Daily cron: hard-delete every demo organization older than 14 days.
 *
 * `Organization.isDemo = true` rows are produced by the (forthcoming
 * Phase 4) /signup?demo=true flow and seeded via
 * `scripts/seed-demo-org.ts`. Each child relation on Organization uses
 * `onDelete: Cascade`, so dropping the row purges every scoped record
 * (candidates, jobs, clients, notes, interviews, applications, …).
 *
 * Auth: same pattern as /api/internal/process-ai-queue —
 *   - `x-vercel-cron: 1` from Vercel's cron infra, OR
 *   - `Authorization: Bearer <CRON_SECRET>` for manual / external calls.
 *
 * Returns: { deleted, ids } so the Vercel logs show the impact.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DEMO_TTL_DAYS = 14;

function isAuthorized(request: NextRequest): boolean {
  if (request.headers.get("x-vercel-cron") === "1") return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured → only allow non-production invocations.
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(auth);
  return Boolean(m && m[1] === secret);
}

async function runCleanup() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DEMO_TTL_DAYS);

  const stale = await prisma.organization.findMany({
    where: { isDemo: true, createdAt: { lt: cutoff } },
    select: { id: true, name: true, slug: true, createdAt: true },
  });

  if (stale.length === 0) {
    return Response.json({ deleted: 0, ids: [] });
  }

  // Cascade-delete via Prisma's onDelete: Cascade on every child relation.
  const ids = stale.map((o) => o.id);
  const result = await prisma.organization.deleteMany({
    where: { id: { in: ids } },
  });

  return Response.json({
    deleted: result.count,
    cutoff: cutoff.toISOString(),
    orgs: stale.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      createdAt: o.createdAt.toISOString(),
    })),
  });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return runCleanup();
}

// Accept POST too in case anything internal prefers it.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return runCleanup();
}
