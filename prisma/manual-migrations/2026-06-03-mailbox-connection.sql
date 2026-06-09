-- Per-user connected sending mailbox (Phase 2 email integration, Gmail first).
-- Additive raw SQL (not db push) to avoid clobbering other agents' in-flight
-- DB changes. New table only.

CREATE TABLE IF NOT EXISTS "MailboxConnection" (
  "id"                    TEXT PRIMARY KEY,
  "userId"                TEXT NOT NULL,
  "provider"              TEXT NOT NULL,
  "email"                 TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "scope"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "MailboxConnection_userId_provider_key"
  ON "MailboxConnection" ("userId", "provider");
CREATE INDEX IF NOT EXISTS "MailboxConnection_userId_idx"
  ON "MailboxConnection" ("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MailboxConnection_userId_fkey') THEN
    ALTER TABLE "MailboxConnection"
      ADD CONSTRAINT "MailboxConnection_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
