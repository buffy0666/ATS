import { NextRequest } from "next/server";
import {
  getAIQueueStats,
  processOneCandidate,
  recoverStuckProcessing,
} from "@/lib/ai/candidate-worker";

/**
 * Background worker invoked by Vercel cron OR by an authenticated admin
 * request. Processes up to BATCH_LIMIT pending candidates per invocation
 * and reports back stats.
 *
 * Works as long as the AI provider configured in /settings/ai is
 * reachable from Vercel (Claude / OpenAI / Grok / public Ollama). For a
 * LAN-local Ollama at gx10.local, use the standalone script
 * `scripts/process-ai-queue.ts` instead — Vercel can't reach internal
 * network addresses.
 *
 * Auth: requires either
 *   - `Authorization: Bearer <CRON_SECRET>` (set as a Vercel env var and
 *      injected by Vercel cron via the X-Vercel-Cron header path).
 *   - During dev, the endpoint is also reachable from the local network.
 */

// Three sequential AI passes per candidate × up to BATCH_LIMIT candidates
// can run long. 60s is the Vercel Pro/Hobby cap for this kind of endpoint.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BATCH_LIMIT = 3;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return processBatch();
}

// Vercel cron sends GET by default; accept both verbs.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return processBatch();
}

async function processBatch() {
  // Recover any PROCESSING rows that have been stuck for >10 minutes
  // (worker probably crashed). They flip back to PENDING so we retry.
  await recoverStuckProcessing();

  const results: Array<
    | { ok: true; candidateId: string }
    | { ok: false; candidateId: string; error: string }
  > = [];

  for (let i = 0; i < BATCH_LIMIT; i++) {
    const result = await processOneCandidate();
    if (!result) break; // queue empty
    results.push(result);
  }

  const stats = await getAIQueueStats();

  return Response.json({
    processed: results.length,
    results,
    queue: stats,
  });
}

function isAuthorized(request: NextRequest): boolean {
  // Vercel Cron adds this header automatically.
  if (request.headers.get("x-vercel-cron") === "1") return true;

  // Manual / cron-via-curl auth: Bearer <CRON_SECRET>.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // If no CRON_SECRET is configured, allow only local-dev calls.
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(auth);
  return Boolean(m && m[1] === secret);
}
