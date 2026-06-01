-- Add the KnowledgeAttachment table (multiple documents per KnowledgeItem).
-- Applied via raw SQL rather than `prisma db push` because the shared DB
-- already carries other agents' in-flight changes (CANDIDATE_MERGE enum,
-- Candidate.searchVector FTS column) that a full push would clobber. This
-- migration is purely additive and touches nothing else.

CREATE TABLE IF NOT EXISTS "KnowledgeAttachment" (
  "id"              TEXT PRIMARY KEY,
  "knowledgeItemId" TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "url"             TEXT NOT NULL,
  "size"            INTEGER NOT NULL,
  "mimeType"        TEXT,
  "uploadedById"    TEXT,
  "uploadedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "KnowledgeAttachment_knowledgeItemId_idx"
  ON "KnowledgeAttachment" ("knowledgeItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeAttachment_knowledgeItemId_fkey'
  ) THEN
    ALTER TABLE "KnowledgeAttachment"
      ADD CONSTRAINT "KnowledgeAttachment_knowledgeItemId_fkey"
      FOREIGN KEY ("knowledgeItemId") REFERENCES "KnowledgeItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeAttachment_uploadedById_fkey'
  ) THEN
    ALTER TABLE "KnowledgeAttachment"
      ADD CONSTRAINT "KnowledgeAttachment_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
