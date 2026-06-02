-- Add the rich-text article body to KnowledgeItem. Sanitized HTML from the
-- portable rich editor. Additive raw SQL (not db push) to avoid clobbering
-- other agents' in-flight DB changes.

ALTER TABLE "KnowledgeItem" ADD COLUMN IF NOT EXISTS "content" TEXT;
