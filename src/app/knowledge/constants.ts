// Content categories for the knowledge base Type field. Kept in a plain
// module (not actions.ts) because a "use server" file may only export async
// functions — exporting this const from there breaks the build.
export const KNOWLEDGE_TYPES = ["How To", "FYI", "Policies"] as const;

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

// Department / content area a knowledge item belongs to. SOP, Sales Content
// and Marketing Content reuse the same KB engine; each renders as a filtered
// view (global KB + sidebar) and can be authored from a client's page.
export const KNOWLEDGE_CATEGORIES = [
  "Sales",
  "Recruiting",
  "Admin",
  "SOP",
  "Sales Content",
  "Marketing Content",
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

// The subset surfaced as their own sidebar entries / filtered views.
export const KNOWLEDGE_SECTION_CATEGORIES = [
  "SOP",
  "Sales Content",
  "Marketing Content",
] as const;
