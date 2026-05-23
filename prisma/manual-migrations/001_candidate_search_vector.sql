-- Adds a generated tsvector column on Candidate that backs FTS for the
-- keyword search bar on /candidates. Prisma cannot describe generated
-- columns, so this migration is intentionally outside the Prisma schema.
--
-- Run this AFTER `prisma db push` has applied the resumeText column.
--
-- Future `prisma db push` calls will not drop this column — Prisma 6 leaves
-- columns it does not know about in place. If `prisma db push --force-reset`
-- is ever run, re-apply this migration.

ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("firstName",'') || ' ' || coalesce("lastName",'')), 'A') ||
    setweight(to_tsvector('english', coalesce("email",'')), 'A') ||
    setweight(to_tsvector('english', coalesce("currentTitle",'') || ' ' || coalesce("currentCompany",'')), 'B') ||
    setweight(to_tsvector('english', coalesce("summary",'')), 'B') ||
    setweight(to_tsvector('english', array_to_string("skills",' ') || ' ' || array_to_string("industries",' ') || ' ' || array_to_string("specialties",' ')), 'B') ||
    setweight(to_tsvector('english', coalesce("notes",'')), 'C') ||
    setweight(to_tsvector('english', coalesce("resumeText",'')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS "Candidate_searchVector_idx" ON "Candidate" USING GIN ("searchVector");
