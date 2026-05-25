/**
 * Local AI queue processor.
 *
 * Run this on any machine that can reach BOTH your Supabase DB and your
 * configured AI provider. The typical use is when you've selected Ollama
 * at a LAN address (e.g. http://gx10.local:11434/v1) in Settings → AI —
 * Vercel can't reach that, so it can't run the cron-triggered batch
 * processor, but YOU can run this script from your dev box and have it
 * drain the queue.
 *
 * Usage:
 *   npm run process-ai-queue          # loop forever, sleep between batches
 *   npm run process-ai-queue -- once  # process up to one batch and exit
 *
 * Reads DATABASE_URL from .env, just like the Next.js app.
 *
 * The actual AI work is identical to what /api/internal/process-ai-queue
 * does on Vercel — both call the same `processOneCandidate()` lib
 * function, which reads the configured provider from the DB-backed
 * AIConfig row.
 */

import { config } from "dotenv";
config();

import {
  getAIQueueStats,
  processOneCandidate,
  recoverStuckProcessing,
} from "../src/lib/ai/candidate-worker";

const POLL_INTERVAL_MS = 30_000;
const STUCK_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;

const argv = process.argv.slice(2);
const onceMode = argv.includes("once");

async function tickOnce(): Promise<{ processed: number; emptied: boolean }> {
  let processed = 0;
  // Empty the whole queue in one pass — typical recruiter session adds
  // candidates in bursts (LinkedIn search → click a few).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await processOneCandidate();
    if (!result) return { processed, emptied: true };
    processed++;
    if (result.ok) {
      console.log(`[ok]    candidate=${result.candidateId}`);
    } else {
      console.log(`[fail]  candidate=${result.candidateId}  ${result.error}`);
    }
  }
}

async function main() {
  console.log("ATS AI queue worker starting…");
  console.log("Mode:", onceMode ? "once" : "loop");

  if (onceMode) {
    await recoverStuckProcessing();
    const result = await tickOnce();
    const stats = await getAIQueueStats();
    console.log(
      `\nDone. processed=${result.processed}  queue=`,
      stats,
    );
    return;
  }

  let lastRecovery = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - lastRecovery > STUCK_RECOVERY_INTERVAL_MS) {
      await recoverStuckProcessing();
      lastRecovery = Date.now();
    }

    const result = await tickOnce();
    const stats = await getAIQueueStats();

    if (result.processed > 0) {
      console.log(
        `[tick] processed=${result.processed}  pending=${stats.pending}  ready=${stats.ready}  failed=${stats.failed}`,
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("Worker crashed:", err);
  process.exit(1);
});
