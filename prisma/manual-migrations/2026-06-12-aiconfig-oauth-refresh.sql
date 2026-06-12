-- AIConfig OAuth auto-refresh columns (authMode "oauth", Anthropic only).
-- The current ACCESS token stays in apiKeyEncrypted; these three let the
-- server mint a fresh one before expiry instead of failing when a pasted
-- Bearer token times out:
--   oauthRefreshTokenEncrypted — AES-256-GCM blob, same scheme as apiKeyEncrypted
--   oauthClientId              — OAuth client id the tokens were issued to
--   oauthExpiresAt             — when the CURRENT access token expires (null =
--                                unknown; the resolver refreshes immediately and
--                                learns the real expiry from the response)
--
-- Applied manually (shared DB; avoid prisma db push syncing unrelated drift):
--   npx tsx scripts/apply-manual-migration.ts prisma/manual-migrations/2026-06-12-aiconfig-oauth-refresh.sql
-- Idempotent: safe to re-run.

ALTER TABLE "AIConfig" ADD COLUMN IF NOT EXISTS "oauthRefreshTokenEncrypted" TEXT;
ALTER TABLE "AIConfig" ADD COLUMN IF NOT EXISTS "oauthClientId" TEXT;
ALTER TABLE "AIConfig" ADD COLUMN IF NOT EXISTS "oauthExpiresAt" TIMESTAMP(3);
