import { promises as fs } from "node:fs";
import path from "node:path";
import { put, del } from "@vercel/blob";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const ALLOWED_RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type SavedAttachment = {
  url: string;
  name: string;
  size: number;
  mimeType: string | null;
};

/**
 * Storage backend selection.
 *
 * - In production (Vercel): set `BLOB_READ_WRITE_TOKEN` and uploads go to
 *   Vercel Blob. URLs are absolute `https://...blob.vercel-storage.com/...`.
 * - In dev (no token): uploads fall back to `public/uploads/` on the local
 *   filesystem. URLs are root-relative `/uploads/<filename>`.
 *
 * Vercel's runtime filesystem is ephemeral and read-only, so the local-disk
 * path will silently lose files in production. `assertWritableStorage()`
 * below refuses to attempt a disk write on Vercel — fail loudly so the
 * recruiter sees a helpful error message instead of a phantom upload that
 * disappears seconds later.
 */
function useBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function assertWritableStorage() {
  if (useBlobStorage()) return;
  if (process.env.VERCEL) {
    throw new Error(
      "File uploads aren't configured on this deployment. " +
        "Set BLOB_READ_WRITE_TOKEN in Vercel → Project Settings → Environment Variables. " +
        "(Without it, files would be written to Vercel's ephemeral filesystem and lost on the next request.)",
    );
  }
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function saveToBlob(
  file: File,
  pathname: string,
  contentType?: string,
): Promise<string> {
  const blob = await put(pathname, file, {
    access: "public",
    contentType: contentType ?? file.type ?? undefined,
    addRandomSuffix: false, // We already prepend Date.now() for uniqueness.
  });
  return blob.url;
}

async function saveToDisk(
  file: File,
  subdir: string | null,
  filename: string,
): Promise<string> {
  const segments = ["public", "uploads", ...(subdir ? [subdir] : [])];
  const dir = path.join(process.cwd(), ...segments);
  await fs.mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, filename), buffer);
  const urlPath = ["/uploads", ...(subdir ? [subdir] : []), filename].join("/");
  return urlPath;
}

/**
 * Persist a resume upload. Returns a public URL — absolute when using Vercel
 * Blob, root-relative when using the local-disk dev fallback.
 *
 * Throws on size or MIME-type violations. Caller is responsible for any
 * additional gating (auth, rate-limiting) — this helper trusts what it's given.
 */
export async function saveResume(file: File): Promise<string> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("Resume exceeds 10 MB limit.");
  }
  if (file.type && !ALLOWED_RESUME_TYPES.has(file.type)) {
    throw new Error("Unsupported resume type. Use PDF or DOCX.");
  }

  const filename = `${Date.now()}-${safeFilename(file.name)}`;
  if (useBlobStorage()) {
    return saveToBlob(file, `uploads/${filename}`);
  }
  assertWritableStorage();
  return saveToDisk(file, null, filename);
}

/**
 * Persist a generic file attachment under uploads/<subdir>. Accepts any MIME
 * type up to MAX_ATTACHMENT_BYTES.
 */
export async function saveAttachment(file: File, subdir: string): Promise<SavedAttachment> {
  if (file.size === 0) {
    throw new Error("Attachment is empty.");
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachment exceeds ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB limit.`);
  }

  const safeSubdir = subdir.replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = `${Date.now()}-${safeFilename(file.name)}`;

  let url: string;
  if (useBlobStorage()) {
    url = await saveToBlob(file, `uploads/${safeSubdir}/${filename}`);
  } else {
    assertWritableStorage();
    url = await saveToDisk(file, safeSubdir, filename);
  }

  return {
    url,
    name: file.name,
    size: file.size,
    mimeType: file.type || null,
  };
}

/**
 * Best-effort removal of an attachment. Silently ignores missing files.
 * Handles both Vercel Blob URLs (absolute https) and local-disk URLs (/uploads/...).
 */
export async function removeAttachmentFile(publicUrl: string): Promise<void> {
  if (!publicUrl) return;

  // Vercel Blob URL — absolute https URL pointing at the configured store.
  if (publicUrl.startsWith("https://") && publicUrl.includes(".blob.vercel-storage.com")) {
    try {
      await del(publicUrl);
    } catch {
      // Already deleted or never existed — fine.
    }
    return;
  }

  // Local-disk dev URL.
  if (publicUrl.startsWith("/uploads/")) {
    const relative = publicUrl.replace(/^\/+/, "");
    const target = path.join(process.cwd(), "public", relative);
    await fs.rm(target, { force: true });
  }
}
