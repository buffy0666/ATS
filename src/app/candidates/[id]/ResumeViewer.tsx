import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";

/**
 * Renders the candidate's resume inline at letter (8.5 × 11) aspect.
 *
 * The viewer is *not* given a parent-height-flex hack — instead the inner
 * box uses CSS aspect-ratio so its height is derived from its rendered
 * width. That way the iframe naturally fills exactly one letter page, the
 * surrounding pane has no black void below short resumes, and the
 * containing page just flows around it. Multi-page PDFs can be scrolled
 * internally via the PDF.js toolbar.
 *
 * Reachability: a /uploads/* file is fs.access-checked before letting the
 * iframe load — otherwise a missing file would 404 and Next would serve
 * its layout-wrapped error page, embedding the ATS sidebar inside the
 * resume pane. Vercel Blob URLs are trusted (cross-origin CDN).
 */
export async function ResumeViewer({ url }: { url: string | null }) {
  const reachable = await checkResume(url);

  if (!reachable.ok) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center min-h-[280px]">
        <div className="text-sm text-zinc-500">
          {reachable.reason === "missing"
            ? "No resume uploaded yet."
            : reachable.reason === "lost"
              ? "The resume file is no longer available."
              : "Resume URL is invalid."}
        </div>
        <div className="text-xs text-zinc-400 max-w-sm">
          {reachable.reason === "lost"
            ? "Earlier uploads weren't persisted (Vercel ephemeral disk). Upload again — Blob storage is now configured so the new file will stick."
            : "Use the “Add/Replace resume” button above."}
        </div>
      </div>
    );
  }

  const safeUrl = reachable.url;

  if (!reachable.isPdf) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center min-h-[280px]">
        <p className="text-sm text-zinc-500 max-w-xs">
          Resume isn&apos;t a PDF, so it can&apos;t be previewed inline. Download it to view.
        </p>
        <Link
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          Download resume
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs">
        <span className="text-zinc-500">Resume preview</span>
        <Link
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-600 dark:text-zinc-300 hover:underline"
        >
          Open in new tab ↗
        </Link>
      </div>
      <div className="bg-zinc-100 dark:bg-zinc-950 p-3">
        <div
          className="mx-auto bg-white shadow-sm overflow-hidden rounded-sm"
          style={{ aspectRatio: "8.5 / 11", maxWidth: "100%" }}
        >
          <iframe
            src={`${safeUrl}#toolbar=1&navpanes=0&view=FitH`}
            title="Resume"
            className="block w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}

type Reachability =
  | { ok: true; url: string; isPdf: boolean }
  | { ok: false; reason: "missing" | "lost" | "invalid" };

async function checkResume(raw: string | null): Promise<Reachability> {
  if (!raw) return { ok: false, reason: "missing" };

  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "missing" };

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return {
      ok: true,
      url: trimmed,
      isPdf: pdfExtension(trimmed),
    };
  }

  if (trimmed.startsWith("/uploads/")) {
    const relative = trimmed.replace(/^\/+/, "");
    const target = path.join(process.cwd(), "public", relative);
    const uploadsRoot = path.join(process.cwd(), "public", "uploads") + path.sep;
    if (!target.startsWith(uploadsRoot)) {
      return { ok: false, reason: "invalid" };
    }
    try {
      await fs.access(target);
    } catch {
      return { ok: false, reason: "lost" };
    }
    return { ok: true, url: trimmed, isPdf: pdfExtension(trimmed) };
  }

  return { ok: false, reason: "invalid" };
}

function pdfExtension(url: string): boolean {
  return url.toLowerCase().split("?")[0].split("#")[0].endsWith(".pdf");
}
