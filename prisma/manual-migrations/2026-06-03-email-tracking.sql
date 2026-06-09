-- Email engagement tracking (Resend webhook) + sequence auto-stop reason.
-- Additive raw SQL (not db push) to avoid clobbering other agents' in-flight
-- DB changes. All columns nullable.

ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "firstClickedAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "bouncedAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "complainedAt" TIMESTAMP(3);

ALTER TABLE "SequenceEnrollment" ADD COLUMN IF NOT EXISTS "autoStopReason" TEXT;
