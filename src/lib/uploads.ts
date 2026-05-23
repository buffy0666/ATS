import { promises as fs } from "node:fs";
import path from "node:path";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/**
 * Persist an uploaded resume to /public/uploads and return its public URL path.
 *
 * Throws on size or MIME-type violations. Callers are responsible for any
 * additional gating (auth, rate-limiting) — this helper trusts what it's given.
 *
 * The destination is on the local filesystem, which is ephemeral on serverless
 * platforms (Vercel). Swap for S3 / R2 / Vercel Blob before deploying to prod.
 */
export async function saveResume(file: File): Promise<string> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("Resume exceeds 10 MB limit.");
  }
  if (file.type && !ALLOWED_RESUME_TYPES.has(file.type)) {
    throw new Error("Unsupported resume type. Use PDF or DOCX.");
  }

  const dir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(dir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);

  return `/uploads/${filename}`;
}
