-- Associate Candidate Lists with jobs and assignees. Two additive join tables:
--   CandidateListJob       — links a list to one or more jobs (multi-choice)
--   CandidateListAssignee  — assigns a list to one or more teammates (label only)
-- Applied via raw SQL rather than `prisma db push` because the shared DB carries
-- other agents' in-flight changes that a full push would clobber. Everything
-- here is additive and touches nothing else.

CREATE TABLE IF NOT EXISTS "CandidateListJob" (
  "id"      TEXT PRIMARY KEY,
  "listId"  TEXT NOT NULL,
  "jobId"   TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CandidateListJob_listId_jobId_key"
  ON "CandidateListJob" ("listId", "jobId");
CREATE INDEX IF NOT EXISTS "CandidateListJob_jobId_idx"
  ON "CandidateListJob" ("jobId");

CREATE TABLE IF NOT EXISTS "CandidateListAssignee" (
  "id"           TEXT PRIMARY KEY,
  "listId"       TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "assignedById" TEXT,
  "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CandidateListAssignee_listId_userId_key"
  ON "CandidateListAssignee" ("listId", "userId");
CREATE INDEX IF NOT EXISTS "CandidateListAssignee_userId_idx"
  ON "CandidateListAssignee" ("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateListJob_listId_fkey') THEN
    ALTER TABLE "CandidateListJob"
      ADD CONSTRAINT "CandidateListJob_listId_fkey"
      FOREIGN KEY ("listId") REFERENCES "CandidateList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateListJob_jobId_fkey') THEN
    ALTER TABLE "CandidateListJob"
      ADD CONSTRAINT "CandidateListJob_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateListAssignee_listId_fkey') THEN
    ALTER TABLE "CandidateListAssignee"
      ADD CONSTRAINT "CandidateListAssignee_listId_fkey"
      FOREIGN KEY ("listId") REFERENCES "CandidateList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateListAssignee_userId_fkey') THEN
    ALTER TABLE "CandidateListAssignee"
      ADD CONSTRAINT "CandidateListAssignee_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateListAssignee_assignedById_fkey') THEN
    ALTER TABLE "CandidateListAssignee"
      ADD CONSTRAINT "CandidateListAssignee_assignedById_fkey"
      FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
