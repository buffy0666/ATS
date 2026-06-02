-- New job fields: hiringProcess + jobType columns, and the JobHiringManager
-- and JobContract child tables. Applied via raw SQL rather than `prisma db
-- push` because the shared DB carries other agents' in-flight changes that a
-- full push would clobber. Everything here is additive.

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "hiringProcess" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "jobType" TEXT;

CREATE TABLE IF NOT EXISTS "JobHiringManager" (
  "id"        TEXT PRIMARY KEY,
  "jobId"     TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "email"     TEXT,
  "phone"     TEXT,
  "chat"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "JobHiringManager_jobId_idx" ON "JobHiringManager" ("jobId");

CREATE TABLE IF NOT EXISTS "JobContract" (
  "id"           TEXT PRIMARY KEY,
  "jobId"        TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "size"         INTEGER NOT NULL,
  "mimeType"     TEXT,
  "uploadedById" TEXT,
  "uploadedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "JobContract_jobId_idx" ON "JobContract" ("jobId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobHiringManager_jobId_fkey') THEN
    ALTER TABLE "JobHiringManager"
      ADD CONSTRAINT "JobHiringManager_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobContract_jobId_fkey') THEN
    ALTER TABLE "JobContract"
      ADD CONSTRAINT "JobContract_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobContract_uploadedById_fkey') THEN
    ALTER TABLE "JobContract"
      ADD CONSTRAINT "JobContract_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
