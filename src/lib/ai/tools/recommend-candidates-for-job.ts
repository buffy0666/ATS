import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { completeJson } from "@/lib/ai";
import { hasSearchInput, searchCandidates } from "@/lib/candidate-search";
import { CandidateStatus } from "@/generated/prisma";
import { defineTool } from "./types";

const scoreSchema = z.object({
  scores: z
    .array(
      z.object({
        candidateId: z.string(),
        score: z.number().min(0).max(100),
        tier: z.enum(["Strong", "Moderate", "Weak"]),
        reason: z.string().max(500),
      }),
    )
    .max(50),
});

/** Compact candidate profile for the scoring prompt. */
type PoolCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  currentTitle: string | null;
  currentCompany: string | null;
  yearsExperience: number | null;
  seniority: string | null;
  summary: string | null;
  skills: string[];
  industries: string[];
  specialties: string[];
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  desiredSalaryMin: number | null;
  desiredSalaryMax: number | null;
  status: CandidateStatus;
};

function candidateBlock(c: PoolCandidate): string {
  const loc = [c.locationCity, c.locationState, c.locationCountry].filter(Boolean).join(", ");
  const parts: string[] = [`candidateId: ${c.id}`, `name: ${c.firstName} ${c.lastName}`];
  if (c.currentTitle || c.currentCompany)
    parts.push(`role: ${[c.currentTitle, c.currentCompany && `at ${c.currentCompany}`].filter(Boolean).join(" ")}`);
  if (c.yearsExperience != null) parts.push(`experience: ${c.yearsExperience}y`);
  if (c.seniority) parts.push(`seniority: ${c.seniority}`);
  if (loc) parts.push(`location: ${loc}`);
  if (c.skills.length) parts.push(`skills: ${c.skills.slice(0, 20).join(", ")}`);
  if (c.industries.length) parts.push(`industries: ${c.industries.slice(0, 8).join(", ")}`);
  if (c.specialties.length) parts.push(`specialties: ${c.specialties.slice(0, 8).join(", ")}`);
  if (c.desiredSalaryMin != null || c.desiredSalaryMax != null)
    parts.push(`desired salary: ${c.desiredSalaryMin ?? "?"}–${c.desiredSalaryMax ?? "?"}`);
  if (c.summary) parts.push(`summary: ${c.summary.slice(0, 500)}`);
  return parts.join("\n");
}

export const recommendCandidatesForJobTool = defineTool({
  name: "recommend_candidates_for_job",
  description:
    "Score and rank candidates by how well they fit a specific job opening, with a 0–100 score, a tier (Strong/Moderate/Weak), and a short written reason for each. Narrows the pool with the job title (or an optional searchQuery), then scores with AI. Returns a ranked shortlist — it does NOT modify any data. After presenting the results, ASK the user whether to save the matches to a candidate list (and what to name it) before calling create_list / add_to_list.",
  requiresAdmin: false,
  parameters: z.object({
    jobId: z.string().min(1).max(40).describe("The job/opening to match candidates against."),
    searchQuery: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Optional Boolean keyword query to narrow the candidate pool before scoring (e.g. \"litigation AND ediscovery -junior\"). If omitted, the job title is used.",
      ),
    status: z
      .array(z.nativeEnum(CandidateStatus))
      .optional()
      .describe("Optional: only score candidates in these statuses. Defaults to all except BLACKLISTED / DO_NOT_CONTACT."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .default(15)
      .describe("How many candidates to pull into the pool and score (default 15, max 25)."),
  }),
  async execute(args, ctx) {
    if (!ctx.organizationId) {
      return { ok: false, error: "No organization context — re-authenticate and try again." };
    }
    const orgId = ctx.organizationId;

    const job = await prisma.job.findFirst({
      where: { id: args.jobId, organizationId: orgId },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        department: true,
        salaryLow: true,
        salaryHigh: true,
        status: true,
      },
    });
    if (!job) return { ok: false, error: "Job not found." };

    // Narrow the pool: explicit searchQuery, else the job title, via FTS.
    const explicitQuery = args.searchQuery?.trim();
    const poolQuery = explicitQuery || job.title;
    const ftsIds = hasSearchInput(poolQuery) ? await searchCandidates(poolQuery, orgId) : null;

    if (ftsIds && ftsIds.length === 0 && explicitQuery) {
      return {
        ok: true,
        job: { id: job.id, title: job.title },
        matches: [],
        note: `No candidates matched the search "${explicitQuery}". Suggest a broader query, or run without searchQuery to score the title-matched pool.`,
      };
    }

    const where: NonNullable<Parameters<typeof prisma.candidate.findMany>[0]>["where"] = {
      organizationId: orgId,
    };
    if (args.status && args.status.length > 0) {
      where.status = { in: args.status };
    } else {
      // Compliance default: never recommend blacklisted / do-not-contact people.
      where.status = { notIn: [CandidateStatus.BLACKLISTED, CandidateStatus.DO_NOT_CONTACT] };
    }
    if (ftsIds && ftsIds.length > 0) {
      where.id = { in: ftsIds };
    }

    const candidates = (await prisma.candidate.findMany({
      where,
      take: args.limit,
      // Preserve FTS relevance order when we have it; else most-recent first.
      orderBy: ftsIds && ftsIds.length > 0 ? undefined : { createdAt: "desc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        currentTitle: true,
        currentCompany: true,
        yearsExperience: true,
        seniority: true,
        summary: true,
        skills: true,
        industries: true,
        specialties: true,
        locationCity: true,
        locationState: true,
        locationCountry: true,
        desiredSalaryMin: true,
        desiredSalaryMax: true,
        status: true,
      },
    })) as PoolCandidate[];

    // Restore relevance order if FTS gave us a ranking.
    const pool =
      ftsIds && ftsIds.length > 0
        ? [...candidates].sort((a, b) => ftsIds.indexOf(a.id) - ftsIds.indexOf(b.id))
        : candidates;

    if (pool.length === 0) {
      return {
        ok: true,
        job: { id: job.id, title: job.title },
        matches: [],
        note: "No candidates available to score for this opening. Try a searchQuery or check that candidates exist.",
      };
    }

    const nameById = new Map(pool.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
    const titleById = new Map(pool.map((c) => [c.id, c.currentTitle]));

    const jobSalary =
      job.salaryLow != null || job.salaryHigh != null
        ? `\nSalary range: ${job.salaryLow ?? "?"}–${job.salaryHigh ?? "?"}`
        : "";

    const prompt = [
      "Score how well each candidate fits the following job opening.",
      "",
      "=== JOB OPENING ===",
      `Title: ${job.title}`,
      job.department ? `Department: ${job.department}` : "",
      job.location ? `Location: ${job.location}` : "",
      jobSalary,
      "",
      "Description:",
      job.description.slice(0, 1500),
      "",
      "=== CANDIDATES ===",
      pool.map((c, i) => `[${i + 1}]\n${candidateBlock(c)}`).join("\n\n"),
      "",
      "For EACH candidate, return: the exact candidateId, a 0–100 fit score, a tier",
      "(Strong = 80–100, Moderate = 50–79, Weak = 0–49), and a 1–2 sentence reason citing",
      "the specific evidence (skills, seniority, location, experience) behind the score.",
      "Only use the candidateId values shown above. Score every candidate listed.",
    ]
      .filter(Boolean)
      .join("\n");

    let scored: z.infer<typeof scoreSchema>["scores"];
    try {
      const result = await completeJson(
        {
          system:
            "You are an expert technical recruiter. You objectively assess candidate–role fit from structured profiles and a job description, and you never invent facts not present in the data.",
          prompt,
          maxTokens: 3000,
          temperature: 0,
          schema: scoreSchema,
        },
        orgId,
      );
      scored = result.data.scores;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown scoring error";
      return { ok: false, error: `Scoring failed: ${message}` };
    }

    // Keep only scores that map to a real candidate in the pool, attach names,
    // and sort best-first.
    const matches = scored
      .filter((s) => nameById.has(s.candidateId))
      .map((s) => ({
        candidateId: s.candidateId,
        name: nameById.get(s.candidateId)!,
        currentTitle: titleById.get(s.candidateId) ?? null,
        score: Math.round(s.score),
        tier: s.tier,
        reason: s.reason,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      ok: true,
      job: { id: job.id, title: job.title, status: job.status },
      poolSize: pool.length,
      matches,
      note:
        "Present these ranked matches to the user with each candidate's score, tier, and reason. " +
        "Then ASK whether they want to save the matches to a candidate list — either CREATE a new list " +
        "(ask the user what to name it) or ADD to an EXISTING list (use list_lists to find it). " +
        "Only call create_list or add_to_list AFTER the user confirms and provides a list name / choice. " +
        "Do not create or modify any list without explicit confirmation.",
    };
  },
});
