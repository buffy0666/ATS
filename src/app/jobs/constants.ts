// Engagement tier for a job. Plain module (not actions.ts) so it can be
// imported by both client components and the server action.
export const JOB_TYPES = ["Urgent", "Normal", "Luxury"] as const;

export type JobType = (typeof JOB_TYPES)[number];

// File types accepted for job contract attachments.
export const CONTRACT_MAX_BYTES = 20 * 1024 * 1024;
export const CONTRACT_ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
