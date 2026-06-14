-- Task <-> Sequence integration.
-- Tasks become the single work surface: each manual sequence step (and any
-- "send it yourself" email step) is materialized as a Task linked 1:1 to its
-- StepRun. Adds candidate/job context + completion disposition to Task, and an
-- autoSend flag to SequenceStep.
--
-- Applied manually (shared DB; avoid prisma db push syncing unrelated drift):
--   npx tsx scripts/apply-manual-migration.ts prisma/manual-migrations/2026-06-14-task-sequence-integration.sql
-- Idempotent: safe to re-run.

-- New enum for task channel/kind.
DO $$ BEGIN
  CREATE TYPE "TaskKind" AS ENUM ('GENERAL', 'CALL', 'EMAIL', 'TEXT', 'LINKEDIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Task: kind + completion disposition + candidate/job + step-run link.
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "kind" "TaskKind" NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "completedById" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "outcomeNote" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "candidateId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "applicationId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "stepRunId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Task_stepRunId_key" ON "Task"("stepRunId");
CREATE INDEX IF NOT EXISTS "Task_candidateId_idx" ON "Task"("candidateId");
CREATE INDEX IF NOT EXISTS "Task_kind_idx" ON "Task"("kind");

-- Foreign keys (ADD CONSTRAINT has no IF NOT EXISTS — guard each one).
DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey"
    FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Task" ADD CONSTRAINT "Task_stepRunId_fkey"
    FOREIGN KEY ("stepRunId") REFERENCES "StepRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SequenceStep: auto-send flag for EMAIL steps (default true = current behavior).
ALTER TABLE "SequenceStep" ADD COLUMN IF NOT EXISTS "autoSend" BOOLEAN NOT NULL DEFAULT true;
