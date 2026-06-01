-- Add the optional `category` column to KnowledgeItem (Sales / Recruiting /
-- Admin). Applied via raw SQL rather than `prisma db push` because the shared
-- DB carries other agents' in-flight changes that a full push would clobber.
-- Additive and nullable, so existing rows are unaffected.

ALTER TABLE "KnowledgeItem" ADD COLUMN IF NOT EXISTS "category" TEXT;
