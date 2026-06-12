-- AIConfig.authMode: how the stored secret is sent to the provider.
--   "apiKey" (default) — provider's native API-key header.
--   "oauth"           — Authorization: Bearer token (Anthropic only, + beta header).
-- Applied manually (the DB is shared with other live deployments, so we avoid
-- `prisma db push` syncing unrelated drift):
--   npx prisma db execute --file prisma\manual-migrations\2026-06-12-aiconfig-auth-mode.sql --schema prisma\schema.prisma
-- Idempotent: safe to re-run.

ALTER TABLE "AIConfig" ADD COLUMN IF NOT EXISTS "authMode" TEXT DEFAULT 'apiKey';
