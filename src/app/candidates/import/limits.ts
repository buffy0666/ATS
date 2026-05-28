// Shared (client + server) caps for the candidate CSV importer. The
// browser pre-checks these before invoking the server action so big files
// produce a clear "split your file" message instead of Next.js's cryptic
// "unexpected response" framework error from an oversized action body.

export const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS_PER_IMPORT = 5000;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
