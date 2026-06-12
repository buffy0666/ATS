import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AIProcessingStatus, type Prisma } from "@/generated/prisma";
import { completeJson } from "@/lib/ai";
import {
  ActivityItemSchema,
  EducationItemSchema,
  WorkHistoryItemSchema,
} from "@/lib/resume-parser/schema";

/**
 * Background AI worker for candidates created via the Chrome extension.
 *
 * Runs THREE passes per candidate so each pass has a focused prompt and
 * stays well under model context limits:
 *
 *   1. Extract structured fields (workHistory, education, summary, skills,
 *      recentActivity) from the raw LinkedIn page text.
 *   2. Generate a polished resume facsimile — a recruiter-friendly,
 *      well-organized resume reconstructed from what we extracted plus the
 *      raw text. This is what shows up in the "AI Resume" tab.
 *   3. Mine the raw text + activity for outreach personalization hooks —
 *      specific things the recruiter could open an email or LinkedIn
 *      message with ("recently posted about scaling K8s — open with that").
 *
 * Whichever AI provider is configured in /settings/ai (DB-backed) is used
 * for all three. Works with Claude / OpenAI / Grok / Ollama identically.
 */

// ----- Schemas the AI must return per pass ---------------------------------

const ExtractSchema = z.object({
  summary: z.string().max(2000).optional(),
  skills: z.array(z.string().min(1).max(80)).max(60).default([]),
  workHistory: z.array(WorkHistoryItemSchema).max(40).default([]),
  education: z.array(EducationItemSchema).max(20).default([]),
  recentActivity: z.array(ActivityItemSchema).max(20).default([]),
  // Optional contact bits we'll fill in if the client didn't.
  currentTitle: z.string().max(160).optional(),
  currentCompany: z.string().max(160).optional(),
  locationCity: z.string().max(120).optional(),
  locationState: z.string().max(120).optional(),
  locationCountry: z.string().max(120).optional(),
});

const FacsimileSchema = z.object({
  header: z.object({
    name: z.string().min(1).max(160),
    title: z.string().max(160).optional(),
    location: z.string().max(160).optional(),
    contact: z
      .array(z.object({ label: z.string().max(40), value: z.string().max(200) }))
      .max(6)
      .default([]),
  }),
  summary: z.string().max(2000).optional(),
  skills: z.array(z.string().min(1).max(80)).max(60).default([]),
  experience: z
    .array(
      z.object({
        company: z.string().min(1).max(160),
        title: z.string().min(1).max(160),
        dates: z.string().max(60).optional(),
        location: z.string().max(120).optional(),
        bullets: z.array(z.string().min(1).max(500)).max(8).default([]),
      }),
    )
    .max(20)
    .default([]),
  education: z
    .array(
      z.object({
        school: z.string().min(1).max(180),
        degree: z.string().max(160).optional(),
        dates: z.string().max(60).optional(),
      }),
    )
    .max(10)
    .default([]),
});

const OutreachSchema = z.object({
  insights: z
    .array(
      z.object({
        hook: z
          .string()
          .min(1)
          .max(280)
          .describe("Short description of what this is — 'recently posted about X'."),
        source: z
          .string()
          .max(40)
          .describe("Which input it came from — 'post', 'comment', 'work-history', 'education', 'profile'."),
        suggestedOpener: z
          .string()
          .min(1)
          .max(500)
          .describe("Specific sentence the recruiter could use to open an email or message."),
        tone: z
          .enum(["congratulatory", "curious", "professional", "casual", "shared-interest"])
          .default("professional"),
      }),
    )
    .max(8)
    .default([]),
});

export type ExtractedFields = z.infer<typeof ExtractSchema>;
export type ResumeFacsimile = z.infer<typeof FacsimileSchema>;
export type OutreachInsights = z.infer<typeof OutreachSchema>;

// ----- Prompts -------------------------------------------------------------

const EXTRACT_SYSTEM = [
  "You extract structured candidate data from LinkedIn profile pages.",
  "Be conservative — only include facts present in the source.",
  "Normalize dates to YYYY-MM or YYYY. Use 'Present' for current roles.",
  "For recentActivity, look for an Activity/Posts/Recent activity section; capture up to 10 of the most recent posts, comments, reposts, or articles.",
  "Each activity item: kind (post/comment/reaction/repost/article), short verbatim text snippet (~250 chars), 1-3 lowercase-hyphenated topic tags, relative time when shown.",
  "Skip LinkedIn UI chrome ('See more', 'Show all activity'), sponsored posts, ads.",
  "Return only JSON matching the schema.",
].join(" ");

const FACSIMILE_SYSTEM = [
  "You produce a clean, recruiter-friendly resume from a LinkedIn profile scrape.",
  "Output is structured JSON; we render it as a styled HTML resume on the candidate page.",
  "Reorganize bullet points to lead with impact and quantified results when the source supports it — never invent numbers.",
  "Use crisp, active voice. Drop LinkedIn meta-text like 'helped with', 'was involved in'.",
  "For experience bullets: 4-6 per role, each a single complete sentence.",
  "For dates: use 'MMM YYYY – MMM YYYY' or 'MMM YYYY – Present'.",
  "Skills: 8-20 canonical names (TypeScript, React, AWS, etc.) — dedupe and sort by relevance.",
  "Return only JSON matching the schema.",
].join(" ");

const OUTREACH_SYSTEM = [
  "You read a candidate's LinkedIn profile and recent activity and surface 3-6 personalization hooks a recruiter can use to open an outreach email or LinkedIn message.",
  "Prefer hooks that are recent and specific (a post from this week, a job change in the last 30 days, a shared connection or interest).",
  "Each hook must include a concrete suggestedOpener — a real sentence the recruiter could paste, not a vague template.",
  "Acceptable tones: congratulatory (job change, promotion, milestone), curious (a recent post or take), shared-interest (alma mater, prior employer, public hobby), professional, casual.",
  "Skip generic hooks like 'they work in tech'. Skip anything you can't ground in the source.",
  "Return only JSON matching the schema.",
].join(" ");

// ----- The actual worker function ------------------------------------------

const PASS_TIMEOUT_MS = 90_000;
const MAX_INPUT_CHARS = 40_000;

export type WorkerResult =
  | { ok: true; candidateId: string }
  | { ok: false; candidateId: string; error: string };

/**
 * Process exactly one PENDING candidate. Atomically reserves the row by
 * flipping it to PROCESSING with a `where` clause that requires the prior
 * status to be PENDING — that way two workers running concurrently won't
 * both grab the same row.
 *
 * Returns the candidate id on success; the calling loop decides whether to
 * keep going.
 */
export async function processOneCandidate(): Promise<WorkerResult | null> {
  // Reserve the oldest PENDING row. Either column carries the source text:
  // linkedinPageText (Chrome ext, new path) or resumeText (legacy in-flight
  // rows captured before the columns were split).
  const pending = await prisma.candidate.findFirst({
    where: {
      aiStatus: AIProcessingStatus.PENDING,
      OR: [{ linkedinPageText: { not: null } }, { resumeText: { not: null } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!pending) return null;
  return claimAndProcess(pending.id);
}

/**
 * Process one specific candidate immediately. Used by the ingestion
 * endpoint (via next/server `after`) so a Chrome-extension capture starts
 * AI processing as soon as the response is sent, instead of waiting for
 * the cron sweep. Claims the row the same way the queue path does, so a
 * concurrently-running cron worker can't double-process it.
 */
export async function processCandidateById(
  candidateId: string,
): Promise<WorkerResult | null> {
  return claimAndProcess(candidateId);
}

async function claimAndProcess(candidateId: string): Promise<WorkerResult | null> {
  const claimed = await prisma.candidate.updateMany({
    where: { id: candidateId, aiStatus: AIProcessingStatus.PENDING },
    data: { aiStatus: AIProcessingStatus.PROCESSING },
  });
  if (claimed.count === 0) {
    // Another worker beat us to it (or the row isn't PENDING); nothing to do.
    return null;
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      linkedinUrl: true,
      currentTitle: true,
      currentCompany: true,
      locationCity: true,
      locationState: true,
      locationCountry: true,
      summary: true,
      linkedinPageText: true,
      resumeText: true,
      // Used to pick the right tenant's AIConfig — every pass below runs
      // against that org's provider/model/api key.
      organizationId: true,
    },
  });

  const sourceText = candidate?.linkedinPageText ?? candidate?.resumeText ?? null;

  if (!candidate || !sourceText) {
    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        aiStatus: AIProcessingStatus.FAILED,
        aiError: "Candidate or source text vanished between claim and read.",
      },
    });
    return { ok: false, candidateId, error: "missing text" };
  }

  const rawText = sourceText.slice(0, MAX_INPUT_CHARS);
  // Resolve every pass against this candidate's tenant. Falls back to env
  // vars if the candidate predates the org-aware backfill (Phase 6 makes
  // org_id NOT NULL and removes this fallback).
  const orgId = candidate.organizationId ?? null;

  try {
    const extract = await completeJson(
      {
        system: EXTRACT_SYSTEM,
        prompt: `Extract structured candidate data from this LinkedIn profile scrape.\n\nSource text:\n${rawText}`,
        schema: ExtractSchema,
        maxTokens: 4000,
        timeoutMs: PASS_TIMEOUT_MS,
      },
      orgId,
    );

    // Resume facsimile builds on the extracted data + raw text so the AI
    // can still consult the original wording for bullet phrasing.
    const facsimile = await completeJson(
      {
        system: FACSIMILE_SYSTEM,
        prompt: [
          "Build a polished recruiter-friendly resume from this candidate.",
          "Use the structured extraction as the spine; consult the raw text for bullet phrasing.",
          "",
          "Candidate name: " + `${candidate.firstName} ${candidate.lastName}`.trim(),
          "Email: " + (candidate.email.endsWith("@unknown.local") ? "(unknown)" : candidate.email),
          "Phone: " + (candidate.phone ?? "(unknown)"),
          "LinkedIn: " + (candidate.linkedinUrl ?? "(unknown)"),
          "",
          "Structured extraction:",
          JSON.stringify({
            summary: extract.data.summary,
            skills: extract.data.skills,
            workHistory: extract.data.workHistory,
            education: extract.data.education,
          }),
          "",
          "Raw LinkedIn text:",
          rawText,
        ].join("\n"),
        schema: FacsimileSchema,
        maxTokens: 4000,
        timeoutMs: PASS_TIMEOUT_MS,
      },
      orgId,
    );

    const outreach = await completeJson(
      {
        system: OUTREACH_SYSTEM,
        prompt: [
          "Surface personalization hooks for outreach to this candidate.",
          "",
          "Recent activity (most useful for hooks):",
          JSON.stringify(extract.data.recentActivity),
          "",
          "Recent work history (also useful — recent role changes, promotions):",
          JSON.stringify(extract.data.workHistory?.slice(0, 5)),
          "",
          "Education (only use if it's notable or recent):",
          JSON.stringify(extract.data.education?.slice(0, 3)),
          "",
          "Candidate summary line:",
          extract.data.summary ?? "(none)",
        ].join("\n"),
        schema: OutreachSchema,
        maxTokens: 2000,
        timeoutMs: PASS_TIMEOUT_MS,
      },
      orgId,
    );

    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        aiStatus: AIProcessingStatus.READY,
        aiProcessedAt: new Date(),
        aiError: null,
        // Fill in fields the client didn't provide; never overwrite what
        // the recruiter / extension supplied with high confidence.
        currentTitle: candidate.currentTitle ?? extract.data.currentTitle ?? null,
        currentCompany: candidate.currentCompany ?? extract.data.currentCompany ?? null,
        locationCity: candidate.locationCity ?? extract.data.locationCity ?? null,
        locationState: candidate.locationState ?? extract.data.locationState ?? null,
        locationCountry: candidate.locationCountry ?? extract.data.locationCountry ?? null,
        summary: candidate.summary ?? extract.data.summary ?? null,
        skills: extract.data.skills,
        workHistory: extract.data.workHistory as unknown as Prisma.InputJsonValue,
        education: extract.data.education as unknown as Prisma.InputJsonValue,
        recentActivity: extract.data.recentActivity as unknown as Prisma.InputJsonValue,
        aiResumeFacsimile: facsimile.data as unknown as Prisma.InputJsonValue,
        outreachInsights: outreach.data.insights as unknown as Prisma.InputJsonValue,
      },
    });

    return { ok: true, candidateId };
  } catch (err) {
    const message =
      err instanceof Error ? err.message.slice(0, 1000) : "Unknown AI worker error";
    await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        aiStatus: AIProcessingStatus.FAILED,
        aiError: message,
      },
    });
    return { ok: false, candidateId, error: message };
  }
}

/**
 * Returns the count of pending candidates for ops/UI display.
 */
export async function getAIQueueStats() {
  const [pending, processing, ready, failed] = await Promise.all([
    prisma.candidate.count({ where: { aiStatus: AIProcessingStatus.PENDING } }),
    prisma.candidate.count({ where: { aiStatus: AIProcessingStatus.PROCESSING } }),
    prisma.candidate.count({ where: { aiStatus: AIProcessingStatus.READY } }),
    prisma.candidate.count({ where: { aiStatus: AIProcessingStatus.FAILED } }),
  ]);
  return { pending, processing, ready, failed };
}

/**
 * Reset a stuck PROCESSING row back to PENDING. Useful when a worker died
 * mid-pass and left the row stranded. Called from the cron endpoint after
 * a generous staleness threshold.
 */
export async function recoverStuckProcessing(staleAfterMs = 10 * 60 * 1000) {
  const cutoff = new Date(Date.now() - staleAfterMs);
  await prisma.candidate.updateMany({
    where: {
      aiStatus: AIProcessingStatus.PROCESSING,
      // updatedAt covers our PROCESSING flip — anything that hasn't
      // moved for `staleAfterMs` is presumed dead.
      updatedAt: { lt: cutoff },
    },
    data: { aiStatus: AIProcessingStatus.PENDING },
  });
}
