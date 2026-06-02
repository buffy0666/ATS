-- Additive User columns for the Technology + User Profile sections on
-- /users/[id] (and the /users table). All nullable / defaulted, so this is
-- safe to apply to the shared DB without backfill. Idempotent.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "technologyComments" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneSystems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "technologyNotes" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileComments" TEXT;
