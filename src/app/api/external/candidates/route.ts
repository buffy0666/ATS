import { NextRequest } from "next/server";
import { z } from "zod";
import { AIProcessingStatus, Prisma } from "@/generated/prisma";
import { authenticateApiToken } from "@/lib/api-tokens";
import { prisma } from "@/lib/prisma";

/**
 * External candidate ingestion endpoint.
 *
 * Auth: `Authorization: Bearer <ats_xxx>` token issued at /settings/api-tokens.
 * Used by the Chrome extension to push LinkedIn profile data into the ATS.
 *
 * Behavior:
 *  - Duplicates by linkedinUrl/email → 409 with the existing candidate.
 *  - Otherwise creates the candidate and returns 201 in ~200ms.
 *  - When `pageText` is provided, it's stored verbatim and the candidate is
 *    flagged `aiStatus = PENDING`. A separate background worker
 *    (`scripts/process-ai-queue.ts`) running on the user's network picks
 *    these up and runs three Ollama passes: (1) extract structured fields,
 *    (2) generate a resume facsimile, (3) extract outreach hooks. This
 *    keeps the Chrome click sub-second instead of blocking on a 20-40s
 *    AI call.
 */

const workItemSchema = z.object({
  company: z.string().trim().max(160).optional(),
  title: z.string().trim().max(160).optional(),
  startDate: z.string().trim().max(40).optional(),
  endDate: z.string().trim().max(40).optional(),
  summary: z.string().trim().max(2000).optional(),
});

const educationItemSchema = z.object({
  school: z.string().trim().max(160).optional(),
  degree: z.string().trim().max(160).optional(),
  field: z.string().trim().max(160).optional(),
  startDate: z.string().trim().max(40).optional(),
  endDate: z.string().trim().max(40).optional(),
});

const bodySchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  // LinkedIn often only exposes a single-name display. Allow an empty
  // lastName rather than 422'ing the whole import.
  lastName: z.string().trim().max(80).optional().default(""),
  // Email is technically optional from LinkedIn — many profiles don't expose it.
  // If absent, we synthesize a placeholder so unique constraint holds; recruiter fixes later.
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(40).optional(),
  linkedinUrl: z.string().trim().url().max(300),
  currentTitle: z.string().trim().max(160).optional(),
  currentCompany: z.string().trim().max(160).optional(),
  locationCity: z.string().trim().max(120).optional(),
  locationState: z.string().trim().max(120).optional(),
  locationCountry: z.string().trim().max(120).optional(),
  summary: z.string().trim().max(5000).optional(),
  workHistory: z.array(workItemSchema).max(40).optional(),
  education: z.array(educationItemSchema).max(20).optional(),
  source: z.string().trim().max(60).optional(),
  // New: full visible text from the LinkedIn profile page. The server runs
  // its AI parser on this to extract structured fields + recent activity.
  // Capped at 100KB; anything past that is almost certainly UI chrome /
  // activity feed noise we don't want to feed into the model.
  pageText: z.string().max(100_000).optional(),
});

function corsHeaders(origin: string | null): Record<string, string> {
  // Allow our own origin and chrome-extension origins. The extension's origin
  // is `chrome-extension://<id>` and that ID is stable per install; we just
  // permit any chrome-extension origin since the bearer-token check is the
  // real gate.
  const allow =
    origin && (origin.startsWith("chrome-extension://") || origin === process.env.APP_URL)
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));

  // Bearer token
  const authHeader = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(authHeader);
  if (!m) {
    return new Response(JSON.stringify({ error: "Missing Bearer token." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const auth = await authenticateApiToken(m[1]);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Invalid or revoked token." }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Body
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body must be JSON." }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Invalid payload.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      }),
      { status: 422, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
  const data = parsed.data;

  // Duplicate detection — by linkedinUrl first (the strongest signal from this source),
  // then by email.
  const existing = await prisma.candidate.findFirst({
    where: {
      OR: [
        { linkedinUrl: data.linkedinUrl },
        ...(data.email ? [{ email: data.email.toLowerCase() }] : []),
      ],
    },
    select: { id: true, firstName: true, lastName: true, linkedinUrl: true },
  });
  if (existing) {
    return new Response(
      JSON.stringify({
        status: "exists",
        candidate: {
          id: existing.id,
          firstName: existing.firstName,
          lastName: existing.lastName,
          linkedinUrl: existing.linkedinUrl,
          url: `${process.env.APP_URL ?? ""}/candidates/${existing.id}`,
        },
      }),
      { status: 409, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  // No email from LinkedIn? Synthesize a unique placeholder so the unique
  // constraint holds. Recruiter fills it in later from the candidate page.
  const email =
    data.email?.toLowerCase() ??
    `linkedin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@unknown.local`;

  // AI parsing happens in a background worker (scripts/process-ai-queue.ts
  // or /api/internal/process-ai-queue). We save the candidate immediately
  // with what the extension provided and flag it PENDING — the worker will
  // pick it up shortly and fill in workHistory, education, summary, skills,
  // recentActivity, resume facsimile, and outreach insights.
  const willQueueAI =
    typeof data.pageText === "string" && data.pageText.length >= 40;

  const created = await prisma.candidate.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName || "",
      email,
      phone: data.phone ?? null,
      linkedinUrl: data.linkedinUrl,
      currentTitle: data.currentTitle ?? null,
      currentCompany: data.currentCompany ?? null,
      locationCity: data.locationCity ?? null,
      locationState: data.locationState ?? null,
      locationCountry: data.locationCountry ?? null,
      summary: data.summary ?? null,
      workHistory: data.workHistory
        ? (data.workHistory as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      education: data.education
        ? (data.education as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      resumeText: data.pageText ?? null,
      source: data.source ?? "LinkedIn",
      sourcedById: auth.userId,
      aiStatus: willQueueAI ? AIProcessingStatus.PENDING : AIProcessingStatus.NONE,
    },
    select: { id: true, firstName: true, lastName: true },
  });

  return new Response(
    JSON.stringify({
      status: "created",
      candidate: {
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName,
        url: `${process.env.APP_URL ?? ""}/candidates/${created.id}`,
      },
      // Tells the extension whether we'll be enriching this candidate
      // asynchronously, so the toast can say "queued for AI processing".
      aiQueued: willQueueAI,
    }),
    { status: 201, headers: { ...cors, "Content-Type": "application/json" } },
  );
}
