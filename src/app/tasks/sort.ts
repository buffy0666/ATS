// Shared constants between tasks/page.tsx (server) and tasks/TasksTable.tsx
// (client). These have to live in a plain module — if SORT_COLUMNS is
// re-exported from a "use client" file, Next.js's RSC bundler replaces
// the value with a client-reference proxy at the server boundary, and
// `SORT_COLUMNS.includes(...)` crashes with "includes is not a function"
// at runtime. See https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns#unsupported-pattern-importing-server-components-into-client-components
// for the inverse rule; this is the same family of issue.

export const SORT_COLUMNS = [
  "name",
  "status",
  "priority",
  "dueDate",
  "updatedAt",
  "createdAt",
] as const;

export type SortColumn = (typeof SORT_COLUMNS)[number];
