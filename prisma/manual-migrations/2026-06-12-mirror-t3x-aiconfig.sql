-- Mirror the T3X workspace's AIConfig settings onto every other workspace.
--
-- Makes T3X's provider/model/base-URL/timeout the standard for all existing
-- tenants. Credentials are NOT copied — each workspace keeps (or enters) its
-- own API key, so this never overwrites or shares a key. New tenants are seeded
-- separately at creation time (see src/lib/ai/seed-config.ts).
-- Run AFTER 2026-06-12-aiconfig-auth-mode.sql.
--
--   npx prisma db execute --file prisma\manual-migrations\2026-06-12-mirror-t3x-aiconfig.sql --schema prisma\schema.prisma
--
-- Idempotent: re-running re-syncs every org's provider/model settings to T3X.
-- For orgs that already have a config, only the non-secret settings are updated;
-- their apiKeyEncrypted and authMode are left untouched. New rows are created
-- with no key (apiKeyEncrypted NULL, authMode 'apiKey') for the OWNER to fill in.
--
-- The template org is matched by slug "t3x" or name "T3X". If your T3X
-- workspace uses a different slug, adjust the WHERE clause below.

DO $$
DECLARE
  tmpl_org_id   text;
  tmpl_provider text;
  tmpl_model    text;
  tmpl_base     text;
  tmpl_timeout  int;
BEGIN
  SELECT o.id, a.provider, a.model, a."baseUrl", a."timeoutMs"
    INTO tmpl_org_id, tmpl_provider, tmpl_model, tmpl_base, tmpl_timeout
  FROM "Organization" o
  JOIN "AIConfig" a ON a."organizationId" = o.id
  WHERE o.slug = 't3x' OR lower(o.name) = 't3x'
  LIMIT 1;

  IF tmpl_org_id IS NULL THEN
    RAISE NOTICE 'No AIConfig found for template org (slug/name "t3x"); nothing to mirror.';
    RETURN;
  END IF;

  INSERT INTO "AIConfig" (
    id, provider, model, "baseUrl", "authMode", "timeoutMs", "updatedAt", "organizationId"
  )
  SELECT
    gen_random_uuid()::text,
    tmpl_provider, tmpl_model, tmpl_base, 'apiKey', tmpl_timeout,
    now(), o.id
  FROM "Organization" o
  WHERE o.id <> tmpl_org_id
  ON CONFLICT ("organizationId") DO UPDATE SET
    provider    = EXCLUDED.provider,
    model       = EXCLUDED.model,
    "baseUrl"   = EXCLUDED."baseUrl",
    "timeoutMs" = EXCLUDED."timeoutMs",
    "updatedAt" = now();
    -- apiKeyEncrypted and authMode intentionally preserved per-workspace.
END $$;
