"use client";

import Link from "next/link";
import { useState } from "react";
import type { CandidateResumeData, Reachability } from "./ResumeViewer";

/**
 * Tabbed resume viewer with four panes:
 *   1. Uploaded — the PDF/DOCX the recruiter dropped in (if any).
 *   2. LinkedIn text — raw scrape from the Chrome extension.
 *   3. AI Resume — facsimile assembled by the background worker.
 *   4. (extension point) — additional views can be added easily.
 *
 * Empty tabs are still clickable but render a clear "no content yet" panel
 * so the recruiter understands the state. The default active tab is the
 * first one that has content.
 */

type TabKey = "email" | "contact" | "uploaded" | "linkedin" | "facsimile";

export function ResumeViewerTabs({
  data,
  resumeReachable,
  emailSlot,
  contactSlot,
}: {
  data: CandidateResumeData;
  resumeReachable: Reachability;
  /**
   * Content for the "Email" tab (position 1). Today this is the existing
   * EmailComposer + EmailHistory. Once the native Outlook connection lands,
   * the email-connection agent swaps the rendered content here — no change
   * to this tab framework required. Omit it and the Email tab is hidden
   * (keeps the component reusable without email context).
   */
  emailSlot?: React.ReactNode;
  /**
   * Content for the "Call / SMS / LI" tab (position 2). Renders the
   * non-email outreach composer + history. Omit to hide the tab.
   */
  contactSlot?: React.ReactNode;
}) {
  const hasEmail = Boolean(emailSlot);
  const hasContact = Boolean(contactSlot);
  const hasUploaded = resumeReachable.ok;
  // LinkedIn text now lives in its own column. Fall back to resumeText for
  // legacy rows captured before the split (they had pageText stored under
  // resumeText) — we detect "legacy" as: no upload AND no PDF text.
  const linkedinText =
    (data as unknown as { linkedinPageText?: string | null }).linkedinPageText ??
    (!hasUploaded ? data.resumeText : null);
  const hasLinkedinText = Boolean(linkedinText && linkedinText.length > 40);
  const hasFacsimile = Boolean(
    // CandidateResumeData carries the raw shape; we narrow inside the panel.
    (data as unknown as { aiResumeFacsimile?: unknown }).aiResumeFacsimile,
  );

  // Email is the default landing tab when present — it's the primary
  // recruiter workspace. Otherwise fall back to the best resume view.
  const initial: TabKey = hasEmail
    ? "email"
    : hasUploaded
      ? "uploaded"
      : hasFacsimile
        ? "facsimile"
        : hasLinkedinText
          ? "linkedin"
          : "uploaded";

  const [active, setActive] = useState<TabKey>(initial);

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 px-2 pt-2 pb-0 bg-zinc-50 dark:bg-zinc-950">
        {hasEmail && (
          <TabButton active={active === "email"} onClick={() => setActive("email")} present>
            Email
          </TabButton>
        )}
        {hasContact && (
          <TabButton
            active={active === "contact"}
            onClick={() => setActive("contact")}
            present
          >
            Call / SMS / LI
          </TabButton>
        )}
        <TabButton
          active={active === "uploaded"}
          onClick={() => setActive("uploaded")}
          present={hasUploaded}
        >
          Uploaded
        </TabButton>
        <TabButton
          active={active === "linkedin"}
          onClick={() => setActive("linkedin")}
          present={hasLinkedinText}
        >
          LinkedIn text
        </TabButton>
        <TabButton
          active={active === "facsimile"}
          onClick={() => setActive("facsimile")}
          present={hasFacsimile}
        >
          AI Resume
        </TabButton>
      </div>

      {active === "email" && <div className="p-5">{emailSlot}</div>}
      {active === "contact" && <div>{contactSlot}</div>}
      {active === "uploaded" && <UploadedPane data={data} reachable={resumeReachable} />}
      {active === "linkedin" && <LinkedinTextPane text={linkedinText} />}
      {active === "facsimile" && <FacsimilePane data={data} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  present,
  children,
}: {
  active: boolean;
  onClick: () => void;
  present: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      }`}
    >
      {children}
      {!present && (
        <span
          className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700"
          title="No content yet"
          aria-hidden
        />
      )}
    </button>
  );
}

// ---- Uploaded PDF pane ----------------------------------------------------

function UploadedPane({
  data,
  reachable,
}: {
  data: CandidateResumeData;
  reachable: Reachability;
}) {
  void data; // currently unused but accepted for symmetry with future panes

  if (!reachable.ok) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center min-h-[280px]">
        <div className="text-sm text-zinc-500">
          {reachable.reason === "missing"
            ? "No resume uploaded yet."
            : reachable.reason === "lost"
              ? "The uploaded resume file is no longer available."
              : "Resume URL is invalid."}
        </div>
        <div className="text-xs text-zinc-400 max-w-sm">
          Use the &ldquo;Add/Replace resume&rdquo; button at the top of the page to upload a PDF or DOCX.
        </div>
      </div>
    );
  }

  const lower = reachable.url.toLowerCase().split("?")[0].split("#")[0];
  if (!lower.endsWith(".pdf")) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center min-h-[280px]">
        <p className="text-sm text-zinc-500 max-w-xs">
          Resume isn&apos;t a PDF, so it can&apos;t be previewed inline.
        </p>
        <Link
          href={reachable.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium"
        >
          Download resume
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end border-b border-zinc-200 dark:border-zinc-800 px-3 py-1 text-xs">
        <Link
          href={reachable.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-600 dark:text-zinc-300 hover:underline"
        >
          Open in new tab ↗
        </Link>
      </div>
      <div className="bg-zinc-100 dark:bg-zinc-950 p-3">
        <div
          className="mx-auto bg-white shadow-sm rounded-sm"
          style={{ aspectRatio: "8.5 / 12.2", maxWidth: "100%" }}
        >
          <iframe
            src={`${reachable.url}#view=FitH&zoom=page-fit&pagemode=none&toolbar=1&navpanes=0`}
            title="Resume"
            className="block w-full h-full border-0 rounded-sm"
          />
        </div>
      </div>
    </div>
  );
}

// ---- LinkedIn raw text pane ----------------------------------------------

function LinkedinTextPane({ text }: { text: string | null }) {
  if (!text || text.length < 40) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center min-h-[280px]">
        <div className="text-sm text-zinc-500">No LinkedIn capture for this candidate.</div>
        <div className="text-xs text-zinc-400 max-w-sm">
          Use the Chrome extension on a LinkedIn profile to push raw page text here for AI processing.
        </div>
      </div>
    );
  }
  return (
    <div className="p-4 max-h-[80vh] overflow-auto">
      <pre className="whitespace-pre-wrap text-xs font-mono text-zinc-700 dark:text-zinc-300 leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

// ---- AI resume facsimile pane --------------------------------------------

type Facsimile = {
  header: {
    name: string;
    title?: string;
    location?: string;
    contact?: { label: string; value: string }[];
  };
  summary?: string;
  skills?: string[];
  experience?: {
    company: string;
    title: string;
    dates?: string;
    location?: string;
    bullets?: string[];
  }[];
  education?: {
    school: string;
    degree?: string;
    dates?: string;
  }[];
};

function FacsimilePane({ data }: { data: CandidateResumeData }) {
  // The facsimile + status fields are extras tucked onto the data object
  // by the candidate page server component. Pull them through a cast so
  // we don't have to widen CandidateResumeData here.
  const extras = data as unknown as {
    aiResumeFacsimile?: Facsimile | null;
    aiStatus?: "NONE" | "PENDING" | "PROCESSING" | "READY" | "FAILED";
    aiError?: string | null;
  };
  const facsimile = extras.aiResumeFacsimile ?? null;
  const status = extras.aiStatus ?? "NONE";

  if (!facsimile) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-10 text-center min-h-[280px]">
        {status === "PENDING" || status === "PROCESSING" ? (
          <>
            <div className="text-sm text-zinc-500">AI resume is being built…</div>
            <div className="text-xs text-zinc-400 max-w-sm">
              Background worker is processing this candidate. Refresh in ~30s.
            </div>
          </>
        ) : status === "FAILED" ? (
          <>
            <div className="text-sm text-red-600">AI processing failed.</div>
            {extras.aiError && (
              <div className="text-xs text-zinc-500 max-w-md">{extras.aiError}</div>
            )}
            <div className="text-xs text-zinc-400 max-w-sm">
              The worker will retry on its next run. Or check Settings → AI provider.
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-zinc-500">No AI resume yet.</div>
            <div className="text-xs text-zinc-400 max-w-sm">
              AI Resume is generated from a LinkedIn capture. Use the Chrome extension on a profile to trigger it.
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-zinc-100 dark:bg-zinc-950 p-4">
      <article className="mx-auto bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 shadow-sm rounded-sm p-8 max-w-3xl text-[13px] leading-relaxed">
        <header className="border-b border-zinc-300 dark:border-zinc-700 pb-3 mb-4">
          <h1 className="text-2xl font-bold tracking-tight">{facsimile.header.name}</h1>
          {facsimile.header.title && (
            <div className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
              {facsimile.header.title}
            </div>
          )}
          <div className="mt-1 text-xs text-zinc-500 flex flex-wrap gap-x-3 gap-y-0.5">
            {facsimile.header.location && <span>{facsimile.header.location}</span>}
            {facsimile.header.contact?.map((c, i) => (
              <span key={i}>
                <span className="text-zinc-400">{c.label}:</span> {c.value}
              </span>
            ))}
          </div>
        </header>

        {facsimile.summary && (
          <section className="mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">
              Summary
            </h2>
            <p className="text-sm">{facsimile.summary}</p>
          </section>
        )}

        {facsimile.skills && facsimile.skills.length > 0 && (
          <section className="mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">
              Skills
            </h2>
            <p className="text-sm">{facsimile.skills.join(" · ")}</p>
          </section>
        )}

        {facsimile.experience && facsimile.experience.length > 0 && (
          <section className="mb-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
              Experience
            </h2>
            <ol className="space-y-4">
              {facsimile.experience.map((role, i) => (
                <li key={i}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-semibold">{role.title}</span>
                      <span className="text-zinc-500"> · {role.company}</span>
                      {role.location && (
                        <span className="text-zinc-400 text-xs ml-1.5">{role.location}</span>
                      )}
                    </div>
                    {role.dates && (
                      <span className="text-xs text-zinc-500 tabular-nums">{role.dates}</span>
                    )}
                  </div>
                  {role.bullets && role.bullets.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 text-[13px] space-y-0.5">
                      {role.bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {facsimile.education && facsimile.education.length > 0 && (
          <section className="mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">
              Education
            </h2>
            <ol className="space-y-1.5">
              {facsimile.education.map((ed, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-medium">{ed.school}</span>
                    {ed.degree && <span className="text-zinc-500"> · {ed.degree}</span>}
                  </div>
                  {ed.dates && (
                    <span className="text-xs text-zinc-500 tabular-nums">{ed.dates}</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </article>
    </div>
  );
}
