-- Mirror the T3X workspace's AIConfig onto every other workspace.
--
-- Makes T3X's provider/model/credential the standard for all existing tenants.
-- New tenants are seeded separately at creation time (see
-- src/lib/ai/seed-config.ts). Run AFTER 2026-06-12-aiconfig-auth-mode.sql.
--
--   npx prisma db execute --file prisma\manual-migrations\2026-06-12-mirror-t3x-aiconfig.sql --schema prisma\schema.prisma
--
-- Idempotent: re-running re-syncs every org to T3X's current config.
--
-- The template org is matched by slug "t3x" or name "T3X". If your T3X
-- workspace uses a different slug, adjust the WHERE clause below.
-- NOTE: this copies T3X's encrypted API key verbatim, so every workspace will
-- use T3X's provider account. Encryption is keyed off a single AUTH_SECRET, so
-- the copied ciphertext decrypts everywhere.

DO $$
DECLARE
  tmpl_org_id   text;
  tmpl_provider text;
  tmpl_model    text;
  tmpl_base     text;
  tmpl_key      text;
  tmpl_authmode text;
  tmpl_timeout  int;
BEGIN
  SELECT o.id, a.provider, a.model, a."baseUrl", a."apiKeyEncrypted", a."authMode", a."timeoutMs"
    INTO tmpl_org_id, tmpl_provider, tmpl_model, tmpl_base, tmpl_key, tmpl_authmode, tmpl_timeout
  FROM "Organization" o
  JOIN "AIConfig" a ON a."organizationId" = o.id
  WHERE o.slug = 't3x' OR lower(o.name) = 't3x'
  LIMIT 1;

  IF tmpl_org_id IS NULL THEN
    RAISE NOTICE 'No AIConfig found for template org (slug/name "t3x"); nothing to mirror.';
    RETURN;
  END IF;

  INSERT INTO "AIConfig" (
    id, provider, model, "baseUrl", "apiKeyEncrypted", "authMode", "timeoutMs", "updatedAt", "organizationId"
  )
  SELECT
    gen_random_uuid()::text,
    tmpl_provider, tmpl_model, tmpl_base, tmpl_key, COALESCE(tmpl_authmode, 'apiKey'), tmpl_timeout,
    now(), o.id
  FROM "Organization" o
  WHERE o.id <> tmpl_org_id
  ON CONFLICT ("organizationId") DO UPDATE SET
    provider          = EXCLUDED.provider,
    model             = EXCLUDED.model,
    "baseUrl"         = EXCLUDED."baseUrl",
    "apiKeyEncrypted" = EXCLUDED."apiKeyEncrypted",
    "authMode"        = EXCLUDED."authMode",
    "timeoutMs"       = EXCLUDED."timeoutMs",
    "updatedAt"       = now();
END $$;
