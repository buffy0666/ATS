import Link from "next/link";

/**
 * Renders the candidate's resume inline. Uses <object> rather than <iframe>
 * with an explicit `type="application/pdf"` — the browser only renders the
 * embed if the response's content-type is actually a PDF. If the response is
 * anything else (404 HTML page, redirect to login, missing file), the
 * browser uses the fallback content instead. This prevents the previous bug
 * where a missing file URL was 404'd by Next and the iframe ended up
 * rendering the ATS sidebar inside the resume pane.
 */
export function ResumeViewer({ url }: { url: string | null }) {
  const safeUrl = normalizeResumeUrl(url);

  if (!safeUrl) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-sm text-zinc-500">No resume uploaded yet.</div>
        <div className="text-xs text-zinc-400">
          Use the &ldquo;Upload resume&rdquo; button above.
        </div>
      </div>
    );
  }

  const lower = safeUrl.toLowerCase().split("?")[0].split("#")[0];
  const isPdf = lower.endsWith(".pdf");

  if (!isPdf) {
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
      <object
        data={`${safeUrl}#toolbar=1&navpanes=0&view=FitH`}
        type="application/pdf"
        className="w-full flex-1 min-h-0 bg-zinc-50 dark:bg-zinc-950"
        aria-label="Resume PDF"
      >
        {/* Fallback shown when the response isn't actually a PDF — e.g. the
            file was lost (Vercel filesystem is ephemeral without Blob
            storage) or the URL redirects to the app. */}
        <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 max-w-sm">
            Couldn&apos;t load the resume preview.
          </p>
          <p className="text-xs text-zinc-500 max-w-sm">
            The file may have been deleted, or production uploads aren&apos;t persisted
            (set <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> in Vercel).
            Try re-uploading.
          </p>
          <Link
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Open file directly
          </Link>
        </div>
      </object>
    </div>
  );
}

/**
 * Only accept URLs that point at a real fetchable resource. Anything else
 * (empty string, hash fragment, stray query string, relative path without a
 * leading slash) would otherwise resolve to the current page URL and embed
 * the ATS app inside the resume pane.
 */
function normalizeResumeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }
  return null;
}
