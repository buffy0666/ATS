-- Named CSV imports: a CandidateImport batch (name + who + when + counts)
-- and a nullable Candidate.importId FK back to it. Additive + idempotent;
-- safe to apply to the shared DB without backfill.

CREATE TABLE IF NOT EXISTS "CandidateImport" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "mode"           TEXT NOT NULL DEFAULT 'create',
  "createdCount"   INTEGER NOT NULL DEFAULT 0,
  "updatedCount"   INTEGER NOT NULL DEFAULT 0,
  "skippedCount"   INTEGER NOT NULL DEFAULT 0,
  "erroredCount"   INTEGER NOT NULL DEFAULT 0,
  "importedById"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FKs (guarded so re-running is a no-op).
DO $$ BEGIN
  ALTER TABLE "CandidateImport"
    ADD CONSTRAINT "CandidateImport_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CandidateImport"
    ADD CONSTRAINT "CandidateImport_importedById_fkey"
    FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "CandidateImport_organizationId_createdAt_idx"
  ON "CandidateImport"("organizationId", "createdAt");

-- Candidate.importId → CandidateImport (SetNull on delete).
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "importId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Candidate"
    ADD CONSTRAINT "Candidate_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "CandidateImport"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
