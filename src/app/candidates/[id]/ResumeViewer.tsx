import { promises as fs } from "node:fs";
import path from "node:path";
import Link from "next/link";

/**
 * Renders the candidate's resume inline.
 *
 * Server-side reachability check: before rendering the iframe, we verify
 * that the URL actually serves a PDF. This is necessary because of two
 * scenarios where a raw <iframe> would silently embed the ATS app inside
 * the resume pane:
 *
 *   (1) Local-disk URLs (/uploads/foo.pdf) where the file is gone — Next
 *       returns the global 404 page rendered inside the root layout (which
 *       includes the sidebar).
 *   (2) Vercel deployments without Blob storage: the file was written to
 *       ephemeral disk and lost, same 404-renders-as-app outcome.
 *
 * For Vercel Blob URLs we trust the URL (it's an absolute cross-origin link
 * to a real CDN, not a same-origin path that could resolve to the app
 * itself).
 */
export async function ResumeViewer({ url }: { url: string | null }) {
  const reachable = await checkResume(url);

  if (!reachable.ok) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-sm text-zinc-500">
          {reachable.reason === "missing"
            ? "No resume uploaded yet."
            : reachable.reason === "lost"
              ? "The resume file is no longer available."
              : "Resume URL is invalid."}
        </div>
        <div className="text-xs text-zinc-400 max-w-sm">
          {reachable.reason === "lost"
            ? "It looks like uploads weren't persisted (likely Vercel ephemeral disk). Upload again — once BLOB_READ_WRITE_TOKEN is set on Vercel, future uploads will stick."
            : "Use the “Upload resume” button above."}
        </div>
      </div>
    );
  }

  const safeUrl = reachable.url;

  if (!reachable.isPdf) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
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
    <div className="h-full flex flex-col">
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
      <iframe
        src={`${safeUrl}#toolbar=1&navpanes=0&view=FitH`}
        title="Resume"
        className="w-full flex-1 min-h-0 border-0 bg-zinc-50 dark:bg-zinc-950"
      />
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

  // Absolute URL — typically a Vercel Blob URL. We trust those: they're
  // cross-origin to a real CDN, so even if the blob is deleted the iframe
  // would just show a CDN-side error page, not the ATS app.
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return {
      ok: true,
      url: trimmed,
      isPdf: pdfExtension(trimmed),
    };
  }

  // Local-disk URL: must point under /public/uploads. Reject anything else,
  // and confirm the file actually exists before letting the iframe load it.
  if (trimmed.startsWith("/uploads/")) {
    const relative = trimmed.replace(/^\/+/, "");
    const target = path.join(process.cwd(), "public", relative);
    // Guard against path traversal — never let `..` escape the uploads dir.
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
