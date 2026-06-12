-- Organization.emailOutDisabled: per-workspace email kill switch.
-- When true, all outbound candidate/contact email from the workspace is
-- blocked (composer, sequences, interview emails, AI email tool). Per-tenant,
-- so toggling it in one workspace never affects others. Defaults false
-- (sending allowed) for every existing org.
-- Applied manually (the DB is shared with other live deployments, so we avoid
-- `prisma db push` syncing unrelated drift):
--   npx prisma db execute --file prisma\manual-migrations\2026-06-12-org-email-kill-switch.sql --schema prisma\schema.prisma
-- Idempotent: safe to re-run.

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "emailOutDisabled" BOOLEAN NOT NULL DEFAULT false;
