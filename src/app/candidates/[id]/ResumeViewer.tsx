import Link from "next/link";

/**
 * Renders the candidate's resume inline. Browsers natively preview PDFs via
 * the <iframe> path; for DOCX or anything else we surface a download link
 * instead since there's no portable in-browser DOCX renderer.
 */
export function ResumeViewer({ url }: { url: string | null }) {
  const safeUrl = normalizeResumeUrl(url);

  if (!safeUrl) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="text-sm text-zinc-500">No resume uploaded yet.</div>
        <div className="text-xs text-zinc-400">
          Upload one via the candidate&apos;s edit flow.
        </div>
      </div>
    );
  }

  const isPdf = safeUrl.toLowerCase().split("?")[0].split("#")[0].endsWith(".pdf");

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
      <iframe
        src={`${safeUrl}#toolbar=1&navpanes=0&view=FitH`}
        title="Resume"
        className="w-full flex-1 min-h-0 border-0 bg-zinc-50 dark:bg-zinc-950"
      />
    </div>
  );
}

/**
 * Whitelist what we'll feed to an iframe `src`. A bogus value like `""`,
 * `"#"`, `"?foo"`, or anything else relative would otherwise resolve to the
 * current page URL and embed the ATS UI inside the resume pane — which is
 * what was happening before this guard.
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
