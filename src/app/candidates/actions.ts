"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { AIProviderError } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import {
  EducationItemSchema,
  getResumeParserVersion,
  parseResume,
  ParsedResumeSchema,
  type ParsedResume,
  WorkHistoryItemSchema,
} from "@/lib/resume-parser";
import { auditCreate, auditUpdate } from "@/lib/audit/write";
import { saveCustomFieldValues } from "@/lib/custom-fields";
import { extractResumeText } from "@/lib/resume-parser/extract";
import { saveResume } from "@/lib/uploads";
import { tagColorForName } from "@/lib/tag-colors";
import {
  CandidateStatus,
  CustomFieldEntity,
  EmploymentType,
  Prisma,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";

const optionalString = (max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      return trimmed || null;
    },
    z.string().max(max).nullable(),
  );

const optionalUrl = (max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (!trimmed) return null;
      // Recruiters often paste "linkedin.com/in/..." without the scheme;
      // normalize before validating so it doesn't blow up the whole form.
      if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
      return trimmed;
    },
    z.string().url().max(max).nullable(),
  );

const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return v ?? null;
      const trimmed = v.trim();
      if (!trimmed) return null;
      const cleaned = trimmed.replace(/[,$\s]/g, "");
      const n = Number(cleaned);
      return Number.isFinite(n) ? Math.round(n) : null;
    },
    z.number().int().min(min).max(max).nullable(),
  );

const optionalDate = () =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (!trimmed) return null;
      const d = new Date(trimmed);
      return Number.isNaN(d.getTime()) ? null : d;
    },
    z.date().nullable(),
  );

const optionalBool = () =>
  z.preprocess((v) => {
    if (typeof v !== "string") return false;
    return v === "on" || v === "true" || v === "1";
  }, z.boolean());

const optionalEnum = <T extends Record<string, string>>(e: T) =>
  z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.nativeEnum(e).nullable(),
  );

const enumArray = <T extends Record<string, string>>(e: T) =>
  z.preprocess((v) => {
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string" && x.length > 0);
    return [];
  }, z.array(z.nativeEnum(e)).default([]));

const stringList = (max: number) =>
  z.preprocess(
    (v) => {
      if (typeof v !== "string") return [];
      return Array.from(
        new Set(
          v
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      );
    },
    z.array(z.string().min(1).max(max)).default([]),
  );

const candidateSchema = z.object({
  // Identity
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  preferredName: optionalString(80),
  pronouns: optionalString(40),

  // Contact
  email: z.string().trim().toLowerCase().email(),
  alternateEmail: z
    .preprocess(
      (v) => {
        if (typeof v !== "string") return null;
        const trimmed = v.trim().toLowerCase();
        return trimmed || null;
      },
      z.string().email().max(200).nullable(),
    ),
  phone: optionalString(40),
  alternatePhone: optionalString(40),

  // Location
  locationCity: optionalString(120),
  locationState: optionalString(120),
  locationCountry: optionalString(120),
  timezone: optionalString(60),
  willingToRelocate: optionalBool(),

  // Work auth
  workAuthorization: optionalEnum(WorkAuth),
  requiresSponsorship: optionalBool(),

  // Links
  linkedinUrl: optionalUrl(300),
  githubUrl: optionalUrl(300),
  portfolioUrl: optionalUrl(300),
  otherUrls: stringList(300),

  // Career snapshot
  currentTitle: optionalString(160),
  currentCompany: optionalString(160),
  yearsExperience: optionalInt(0, 80),
  // source and seniority are now user-editable strings backed by ChoiceOption.
  // Accepted as free text; the form picks from the registry.
  seniority: optionalString(80),

  // Compensation
  desiredSalaryMin: optionalInt(0, 100_000_000),
  desiredSalaryMax: optionalInt(0, 100_000_000),
  currentSalary: optionalInt(0, 100_000_000),
  salaryCurrency: z
    .preprocess((v) => {
      if (typeof v !== "string") return "USD";
      const trimmed = v.trim().toUpperCase();
      return trimmed || "USD";
    }, z.string().min(3).max(8)),

  // Availability
  availableFrom: optionalDate(),
  noticePeriodDays: optionalInt(0, 365),
  employmentTypePref: enumArray(EmploymentType),
  remotePref: enumArray(RemotePref),

  // Focus
  industries: stringList(120),
  specialties: stringList(120),

  // Source & ownership
  source: optionalString(80),
  sourceDetail: optionalString(200),
  sourcedById: optionalString(50),
  referredByUserId: optionalString(50),
  referredByContactId: optionalString(50),
  referredByName: optionalString(160),

  // Engagement
  status: z.nativeEnum(CandidateStatus).default(CandidateStatus.ACTIVE),
  rating: optionalInt(1, 5),
  nextFollowUpAt: optionalDate(),

  // Free-form
  summary: optionalString(1000),
  notes: optionalString(5000),
});

const structuredCandidateSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(80)).default([]),
  workHistory: z.array(WorkHistoryItemSchema).default([]),
  education: z.array(EducationItemSchema).default([]),
  parserVersion: z.string().trim().max(160).optional().or(z.literal("")).transform((v) => v || null),
});

import type {
  CandidateFieldValues,
  CandidateResumeParseResult,
} from "./candidate-form-types";

export async function parseCandidateResume(formData: FormData): Promise<CandidateResumeParseResult> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  // Use the caller's org for AI provider resolution so each tenant's
  // configured key + model is used. Null tolerated for legacy sessions.
  const orgId = session.user.organizationId ?? null;

  const currentFields = getCandidateFieldValues(formData);
  const resume = formData.get("resume");
  if (!(resume instanceof File) || resume.size === 0) {
    return {
      status: "error",
      message: "Upload a PDF or DOCX resume before parsing.",
      fields: currentFields,
    };
  }

  try {
    const parsed = ParsedResumeSchema.parse(await parseResume(resume, orgId));
    const parserVersion = getResumeParserVersion();

    return {
      status: "success",
      message: "Resume parsed. Review the extracted details before creating the candidate.",
      fields: {
        firstName: currentFields.firstName || parsed.firstName || "",
        lastName: currentFields.lastName || parsed.lastName || "",
        email: currentFields.email || parsed.email || "",
        phone: currentFields.phone || parsed.phone || "",
        linkedinUrl: currentFields.linkedinUrl || parsed.linkedinUrl || "",
        githubUrl: currentFields.githubUrl || parsed.githubUrl || "",
        portfolioUrl: currentFields.portfolioUrl || parsed.portfolioUrl || "",
        locationCity: currentFields.locationCity || parsed.locationCity || "",
        locationState: currentFields.locationState || parsed.locationState || "",
        locationCountry: currentFields.locationCountry || parsed.locationCountry || "",
        currentTitle: currentFields.currentTitle || parsed.currentTitle || "",
        currentCompany: currentFields.currentCompany || parsed.currentCompany || "",
        yearsExperience:
          currentFields.yearsExperience ||
          (typeof parsed.yearsExperience === "number" ? String(parsed.yearsExperience) : ""),
      },
      parsed,
      parserVersion,
    };
  } catch (error) {
    return {
      status: "error",
      message: friendlyParseError(error),
      fields: currentFields,
    };
  }
}

export async function createCandidate(formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();

  const data = candidateSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    preferredName: formData.get("preferredName"),
    pronouns: formData.get("pronouns"),
    email: formData.get("email"),
    alternateEmail: formData.get("alternateEmail"),
    phone: formData.get("phone"),
    alternatePhone: formData.get("alternatePhone"),
    locationCity: formData.get("locationCity"),
    locationState: formData.get("locationState"),
    locationCountry: formData.get("locationCountry"),
    timezone: formData.get("timezone"),
    willingToRelocate: formData.get("willingToRelocate"),
    workAuthorization: formData.get("workAuthorization"),
    requiresSponsorship: formData.get("requiresSponsorship"),
    linkedinUrl: formData.get("linkedinUrl"),
    githubUrl: formData.get("githubUrl"),
    portfolioUrl: formData.get("portfolioUrl"),
    otherUrls: formData.get("otherUrls"),
    currentTitle: formData.get("currentTitle"),
    currentCompany: formData.get("currentCompany"),
    yearsExperience: formData.get("yearsExperience"),
    seniority: formData.get("seniority"),
    desiredSalaryMin: formData.get("desiredSalaryMin"),
    desiredSalaryMax: formData.get("desiredSalaryMax"),
    currentSalary: formData.get("currentSalary"),
    salaryCurrency: formData.get("salaryCurrency"),
    availableFrom: formData.get("availableFrom"),
    noticePeriodDays: formData.get("noticePeriodDays"),
    employmentTypePref: formData.getAll("employmentTypePref"),
    remotePref: formData.getAll("remotePref"),
    industries: formData.get("industries"),
    specialties: formData.get("specialties"),
    source: formData.get("source"),
    sourceDetail: formData.get("sourceDetail"),
    sourcedById: formData.get("sourcedById"),
    referredByUserId: formData.get("referredByUserId"),
    referredByContactId: formData.get("referredByContactId"),
    referredByName: formData.get("referredByName"),
    status: formData.get("status") || CandidateStatus.ACTIVE,
    rating: formData.get("rating"),
    nextFollowUpAt: formData.get("nextFollowUpAt"),
    summary: formData.get("summary"),
    notes: formData.get("notes"),
  });
  const structuredData = parseStructuredCandidateData(formData);
  const tagIds = await syncTagNamesToIds(formData.getAll("tags").map(String));

  const resume = formData.get("resume");
  let resumeUrl: string | null = null;
  let resumeText: string | null = null;
  if (resume instanceof File && resume.size > 0) {
    resumeUrl = await saveResume(resume);
    resumeText = await extractResumeTextSafely(resume);
  }

  const sourcedById = data.sourcedById ?? session.user.id ?? null;

  let candidate;
  try {
    candidate = await prisma.candidate.create({
      data: {
        ...data,
        sourcedById,
        organizationId: orgId,
        resumeUrl,
        resumeText,
        skills: structuredData.skills,
        workHistory: structuredData.workHistory ?? undefined,
        education: structuredData.education ?? undefined,
        parsedAt: structuredData.parserVersion ? new Date() : null,
        parserVersion: structuredData.parserVersion,
        tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
      },
    });
  } catch (err) {
    // P2002 = unique violation. Email is unique PER ORG, so this means a
    // candidate with this email already exists in THIS workspace. Rather
    // than 500, send the user to the existing record — that's almost
    // always what they wanted (e.g. they clicked "Create candidate" from
    // the Outlook add-in on someone already on file).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.candidate.findFirst({
        where: { organizationId: orgId, email: data.email },
        select: { id: true },
      });
      if (existing) redirect(`/candidates/${existing.id}?exists=1`);
    }
    throw err;
  }

  await saveCustomFieldValues(CustomFieldEntity.CANDIDATE, candidate.id, orgId, formData);
  await auditCreate("Candidate", candidate as unknown as Record<string, unknown>);

  revalidatePath("/candidates");
  redirect(`/candidates/${candidate.id}`);
}

export type UpdateResumeResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Upload (or replace) a candidate's resume from the candidate detail page.
 * Saves the file, runs the same text extraction we do at create time, and
 * stamps parsedAt to null so it's clear the new file hasn't been AI-parsed
 * yet — the user can click "Parse resume" separately if they want structured
 * data lifted.
 */
export async function updateCandidateResume(
  candidateId: string,
  formData: FormData,
): Promise<UpdateResumeResult> {
  const { orgId } = await requireSessionWithOrg();

  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PDF or DOCX file before uploading." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, error: "Resume must be 15 MB or smaller." };
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".doc")) {
    return { ok: false, error: "Only PDF, DOC, and DOCX files are supported." };
  }

  // Confirm the candidate belongs to the caller's org before writing —
  // otherwise a guessed id from another tenant could be hijacked.
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!candidate) return { ok: false, error: "Candidate not found." };

  try {
    const resumeUrl = await saveResume(file);
    const resumeText = await extractResumeTextSafely(file);

    const before = await prisma.candidate.findFirst({
      where: { id: candidateId, organizationId: orgId },
    });
    const after = await prisma.candidate.update({
      where: { id: candidateId },
      data: {
        resumeUrl,
        resumeText,
        // The previous parsed data is now stale relative to this new file.
        // Clear the stamp so the UI doesn't claim it's up to date.
        parsedAt: null,
        parserVersion: null,
      },
    });
    await auditUpdate(
      "Candidate",
      before as unknown as Record<string, unknown> | null,
      after as unknown as Record<string, unknown>,
    );

    revalidatePath(`/candidates/${candidateId}`);
    revalidatePath("/candidates");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save resume.",
    };
  }
}

async function syncTagNamesToIds(rawNames: string[]): Promise<string[]> {
  const names = Array.from(
    new Set(rawNames.map((n) => n.trim()).filter((n) => n.length > 0 && n.length <= 60)),
  );
  if (names.length === 0) return [];

  const tags = await Promise.all(
    names.map((name) =>
      prisma.tag.upsert({
        where: { name },
        create: { name, color: tagColorForName(name) },
        update: {},
      }),
    ),
  );
  return tags.map((t) => t.id);
}

function parseStructuredCandidateData(formData: FormData) {
  const structured = structuredCandidateSchema.parse({
    skills: parseJsonFormField(formData, "skills") ?? [],
    workHistory: parseJsonFormField(formData, "workHistory") ?? [],
    education: parseJsonFormField(formData, "education") ?? [],
    parserVersion: formData.get("parserVersion"),
  });

  return {
    skills: structured.skills,
    workHistory: structured.workHistory.length > 0 ? structured.workHistory : null,
    education: structured.education.length > 0 ? structured.education : null,
    parserVersion: structured.parserVersion,
  };
}

function parseJsonFormField(formData: FormData, name: string): unknown {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) return undefined;
  return JSON.parse(value);
}

function getCandidateFieldValues(formData: FormData): CandidateFieldValues {
  return {
    firstName: stringValue(formData.get("firstName")),
    lastName: stringValue(formData.get("lastName")),
    email: stringValue(formData.get("email")),
    phone: stringValue(formData.get("phone")),
    linkedinUrl: stringValue(formData.get("linkedinUrl")),
    githubUrl: stringValue(formData.get("githubUrl")),
    portfolioUrl: stringValue(formData.get("portfolioUrl")),
    locationCity: stringValue(formData.get("locationCity")),
    locationState: stringValue(formData.get("locationState")),
    locationCountry: stringValue(formData.get("locationCountry")),
    currentTitle: stringValue(formData.get("currentTitle")),
    currentCompany: stringValue(formData.get("currentCompany")),
    yearsExperience: stringValue(formData.get("yearsExperience")),
  };
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

async function extractResumeTextSafely(file: File): Promise<string | null> {
  try {
    return await extractResumeText(file);
  } catch (error) {
    console.warn("Resume text extraction failed; storing candidate without resumeText.", error);
    return null;
  }
}

function friendlyParseError(error: unknown): string {
  if (error instanceof AIProviderError) {
    return "Resume parsing is unavailable right now. Check the AI provider configuration and try again.";
  }
  if (error instanceof Error) return error.message;
  return "Could not parse this resume. Try again or enter the candidate details manually.";
}
