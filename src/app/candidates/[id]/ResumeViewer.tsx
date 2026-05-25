import { promises as fs } from "node:fs";
import path from "node:path";
import type { ActivityItem, EducationItem, WorkHistoryItem } from "@/lib/resume-parser";
import { ResumeViewerTabs } from "./ResumeViewerTabs";

/**
 * Server-side wrapper around the tabbed viewer. We do the filesystem
 * reachability check for /uploads/* PDFs here (server-only) and then hand
 * the resolved props down to a client component that owns the tab UI.
 *
 * Why this design:
 *   - Path checks need fs.access, which can't run in a client component.
 *   - Tab switching needs useState, which can't run in a server component.
 *   - Splitting at this boundary keeps both happy.
 */

export type CandidateResumeData = {
  /** PDF / DOCX upload — null if no file was attached. */
  resumeUrl: string | null;
  /** Raw text scraped from the LinkedIn profile by the Chrome extension. */
  resumeText: string | null;
  /** Long-form summary the AI parser produced. */
  summary: string | null;
  /** AI-extracted skills (canonical names). */
  skills: string[];
  /** AI-extracted work history. */
  workHistory: WorkHistoryItem[];
  /** AI-extracted education. */
  education: EducationItem[];
  /** LinkedIn recent activity (only for candidates added via extension). */
  recentActivity: ActivityItem[];
  /** Candidate name for the synthesized resume facsimile header. */
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  linkedinUrl: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
};

export async function ResumeViewer({ data }: { data: CandidateResumeData }) {
  const reachable = await checkResume(data.resumeUrl);
  return <ResumeViewerTabs data={data} resumeReachable={reachable} />;
}

export type Reachability =
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
