-- Link knowledge items to a client (optional). Additive raw SQL (not db push)
-- to avoid clobbering other agents' in-flight DB changes.

ALTER TABLE "KnowledgeItem" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "KnowledgeItem_clientId_idx" ON "KnowledgeItem" ("clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeItem_clientId_fkey') THEN
    ALTER TABLE "KnowledgeItem"
      ADD CONSTRAINT "KnowledgeItem_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
