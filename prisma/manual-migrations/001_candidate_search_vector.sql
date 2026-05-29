-- Adds a tsvector column on Candidate that backs FTS for the keyword
-- search bar on /candidates. Prisma cannot describe this column, so the
-- migration lives outside the Prisma schema.
--
-- A trigger keeps the column in sync; the GENERATED ALWAYS approach the
-- original migration used does not compile because to_tsvector(regconfig,
-- text) is only marked STABLE (not IMMUTABLE) in vanilla Postgres.
--
-- Run this AFTER `prisma db push` has applied the underlying columns.
-- Idempotent: every step uses IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

CREATE OR REPLACE FUNCTION candidate_search_vector_update()
RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."firstName",'') || ' ' || coalesce(NEW."lastName",'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."email",'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."currentTitle",'') || ' ' || coalesce(NEW."currentCompany",'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."summary",'')), 'B') ||
    setweight(to_tsvector('english',
      array_to_string(coalesce(NEW."skills", ARRAY[]::text[]),' ') || ' ' ||
      array_to_string(coalesce(NEW."industries", ARRAY[]::text[]),' ') || ' ' ||
      array_to_string(coalesce(NEW."specialties", ARRAY[]::text[]),' ')
    ), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."notes",'')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW."resumeText",'')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS candidate_search_vector_trigger ON "Candidate";
CREATE TRIGGER candidate_search_vector_trigger
BEFORE INSERT OR UPDATE OF "firstName", "lastName", "email", "currentTitle",
  "currentCompany", "summary", "skills", "industries", "specialties",
  "notes", "resumeText"
ON "Candidate"
FOR EACH ROW EXECUTE FUNCTION candidate_search_vector_update();

CREATE INDEX IF NOT EXISTS "Candidate_searchVector_idx" ON "Candidate" USING GIN ("searchVector");

-- Backfill existing rows: a no-op UPDATE fires the trigger for every
-- candidate, populating searchVector in place. Skipped for rows that
-- already have a vector so re-running is cheap.
UPDATE "Candidate"
SET "firstName" = "firstName"
WHERE "searchVector" IS NULL;
