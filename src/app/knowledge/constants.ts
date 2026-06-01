// Content categories for the knowledge base Type field. Kept in a plain
// module (not actions.ts) because a "use server" file may only export async
// functions — exporting this const from there breaks the build.
export const KNOWLEDGE_TYPES = ["How To", "FYI", "Policies"] as const;

export type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];

// Department a knowledge item belongs to.
export const KNOWLEDGE_CATEGORIES = ["Sales", "Recruiting", "Admin"] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];
