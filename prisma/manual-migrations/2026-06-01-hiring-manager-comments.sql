-- Add per-hiring-manager comments. Additive raw SQL (not db push) to avoid
-- clobbering other agents' in-flight DB changes.

ALTER TABLE "JobHiringManager" ADD COLUMN IF NOT EXISTS "comments" TEXT;
