-- Candidate FTS trigger: add locationCity + locationState to the
-- searchVector index. Applied to production Supabase on 2026-05-29 via
-- scripts/applied directly. Kept in the repo so future re-creates of
-- the DB (or other agents reading the schema) can see the current state
-- of the trigger function.
--
-- Prisma does not model tsvector columns or triggers, so this lives
-- outside the prisma/migrations/ directory.

CREATE OR REPLACE FUNCTION public.candidate_search_vector_update()
RETURNS trigger LANGUAGE plpgsql AS $$
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
    setweight(to_tsvector('english',
      coalesce(NEW."locationCity",'') || ' ' || coalesce(NEW."locationState",'')
    ), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."notes",'')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW."resumeText",'')), 'C');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS candidate_search_vector_trigger ON "Candidate";
CREATE TRIGGER candidate_search_vector_trigger
BEFORE INSERT OR UPDATE OF
  "firstName", "lastName", email,
  "currentTitle", "currentCompany",
  summary, skills, industries, specialties,
  "locationCity", "locationState",
  notes, "resumeText"
ON public."Candidate"
FOR EACH ROW EXECUTE FUNCTION candidate_search_vector_update();

-- Backfill: touch every row so the new trigger fires.
UPDATE "Candidate" SET "firstName" = "firstName";
