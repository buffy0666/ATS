-- ProfileLayout: named saved layouts for the candidate-detail Profile section.
-- Applied manually (the DB is shared with other live deployments, so we avoid
-- `prisma db push` syncing unrelated drift):
--   npx prisma db execute --file prisma\manual-migrations\2026-06-12-profile-layouts.sql --schema prisma\schema.prisma
-- Idempotent: safe to re-run. Reuses the existing "SavedSearchScope" enum.

CREATE TABLE IF NOT EXISTS "ProfileLayout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "SavedSearchScope" NOT NULL DEFAULT 'PERSONAL',
    "config" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileLayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProfileLayout_ownerId_idx" ON "ProfileLayout"("ownerId");

CREATE INDEX IF NOT EXISTS "ProfileLayout_organizationId_idx" ON "ProfileLayout"("organizationId");

-- Foreign keys (ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS, so guard
-- via pg_constraint for idempotency).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProfileLayout_ownerId_fkey'
  ) THEN
    ALTER TABLE "ProfileLayout"
      ADD CONSTRAINT "ProfileLayout_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProfileLayout_organizationId_fkey'
  ) THEN
    ALTER TABLE "ProfileLayout"
      ADD CONSTRAINT "ProfileLayout_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
