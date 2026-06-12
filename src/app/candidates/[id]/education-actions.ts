"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

/**
 * CRUD for the structured Education + Certification sections on the candidate
 * profile. Both are child rows that cascade from Candidate (see
 * CandidateEducation / CandidateCertification in the schema). Degree level and
 * certification kind are free-form strings backed by the editable ChoiceOption
 * registry (candidate.educationDegree / candidate.certificationKind), so they
 * are validated as plain trimmed strings rather than against a fixed enum.
 *
 * Mirrors meetings-actions.ts: requireSessionWithOrg → tenant-scoped lookup →
 * zod parse → write → revalidatePath.
 */

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };
export type MutateResult = { ok: true } | { ok: false; error: string };

// Empty form values come through as "" — normalise to null for optional
// columns so we don't persist empty strings.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

// Year inputs arrive as strings; "" → null, otherwise a plausible 4-digit year.
const optionalYear = z
  .preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.coerce.number().int().min(1900).max(2100).nullable(),
  )
  .catch(null);

// date inputs arrive as "YYYY-MM-DD" (or ""); parse to a Date or null.
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Invalid date")
  .transform((v) => (v ? new Date(v) : null));

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.null()])
  .optional()
  .transform((v) => v === "on" || v === "true");

// ----- Education -----

const educationSchema = z.object({
  institution: z.string().trim().min(1, "School / institution is required.").max(200),
  degree: optionalText(120),
  fieldOfStudy: optionalText(200),
  specialization: optionalText(200),
  startYear: optionalYear,
  endYear: optionalYear,
  inProgress: checkbox,
  gpa: optionalText(40),
  locationCity: optionalText(120),
  locationCountry: optionalText(120),
  honors: optionalText(500),
  notes: optionalText(4000),
});

function readEducation(formData: FormData) {
  return educationSchema.safeParse({
    institution: formData.get("institution") ?? "",
    degree: formData.get("degree") ?? undefined,
    fieldOfStudy: formData.get("fieldOfStudy") ?? undefined,
    specialization: formData.get("specialization") ?? undefined,
    startYear: formData.get("startYear") ?? "",
    endYear: formData.get("endYear") ?? "",
    inProgress: formData.get("inProgress"),
    gpa: formData.get("gpa") ?? undefined,
    locationCity: formData.get("locationCity") ?? undefined,
    locationCountry: formData.get("locationCountry") ?? undefined,
    honors: formData.get("honors") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
}

/**
 * Create (educationId = null) or update an education record. The update path
 * tenant-scopes through the parent candidate's org so a forged id from another
 * workspace can't be touched.
 */
export async function saveEducation(
  candidateId: string,
  educationId: string | null,
  formData: FormData,
): Promise<SaveResult> {
  const { orgId } = await requireSessionWithOrg();

  const parsed = readEducation(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!candidate) return { ok: false, error: "Candidate not found in your workspace." };

  const data = parsed.data;

  if (educationId) {
    const existing = await prisma.candidateEducation.findFirst({
      where: { id: educationId, candidate: { organizationId: orgId } },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "Education record not found." };
    await prisma.candidateEducation.update({ where: { id: existing.id }, data });
    revalidatePath(`/candidates/${candidate.id}`);
    return { ok: true, id: existing.id };
  }

  const created = await prisma.candidateEducation.create({
    data: { ...data, candidateId: candidate.id },
    select: { id: true },
  });
  revalidatePath(`/candidates/${candidate.id}`);
  return { ok: true, id: created.id };
}

export async function deleteEducation(educationId: string): Promise<MutateResult> {
  const { orgId } = await requireSessionWithOrg();

  const existing = await prisma.candidateEducation.findFirst({
    where: { id: educationId, candidate: { organizationId: orgId } },
    select: { id: true, candidateId: true },
  });
  if (!existing) return { ok: false, error: "Education record not found." };

  await prisma.candidateEducation.delete({ where: { id: existing.id } });
  revalidatePath(`/candidates/${existing.candidateId}`);
  return { ok: true };
}

// ----- Certifications -----

const certificationSchema = z.object({
  name: z.string().trim().min(1, "Certification name is required.").max(200),
  issuingOrganization: optionalText(200),
  kind: optionalText(60),
  credentialId: optionalText(120),
  credentialUrl: optionalText(500),
  jurisdiction: optionalText(120),
  issueDate: optionalDate,
  expirationDate: optionalDate,
  doesNotExpire: checkbox,
  inProgress: checkbox,
  notes: optionalText(4000),
});

function readCertification(formData: FormData) {
  return certificationSchema.safeParse({
    name: formData.get("name") ?? "",
    issuingOrganization: formData.get("issuingOrganization") ?? undefined,
    kind: formData.get("kind") ?? undefined,
    credentialId: formData.get("credentialId") ?? undefined,
    credentialUrl: formData.get("credentialUrl") ?? undefined,
    jurisdiction: formData.get("jurisdiction") ?? undefined,
    issueDate: formData.get("issueDate") ?? undefined,
    expirationDate: formData.get("expirationDate") ?? undefined,
    doesNotExpire: formData.get("doesNotExpire"),
    inProgress: formData.get("inProgress"),
    notes: formData.get("notes") ?? undefined,
  });
}

export async function saveCertification(
  candidateId: string,
  certificationId: string | null,
  formData: FormData,
): Promise<SaveResult> {
  const { orgId } = await requireSessionWithOrg();

  const parsed = readCertification(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!candidate) return { ok: false, error: "Candidate not found in your workspace." };

  // A lifetime credential can't also carry an expiry — keep the row coherent.
  const data = { ...parsed.data };
  if (data.doesNotExpire) data.expirationDate = null;

  if (certificationId) {
    const existing = await prisma.candidateCertification.findFirst({
      where: { id: certificationId, candidate: { organizationId: orgId } },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "Certification not found." };
    await prisma.candidateCertification.update({ where: { id: existing.id }, data });
    revalidatePath(`/candidates/${candidate.id}`);
    return { ok: true, id: existing.id };
  }

  const created = await prisma.candidateCertification.create({
    data: { ...data, candidateId: candidate.id },
    select: { id: true },
  });
  revalidatePath(`/candidates/${candidate.id}`);
  return { ok: true, id: created.id };
}

export async function deleteCertification(certificationId: string): Promise<MutateResult> {
  const { orgId } = await requireSessionWithOrg();

  const existing = await prisma.candidateCertification.findFirst({
    where: { id: certificationId, candidate: { organizationId: orgId } },
    select: { id: true, candidateId: true },
  });
  if (!existing) return { ok: false, error: "Certification not found." };

  await prisma.candidateCertification.delete({ where: { id: existing.id } });
  revalidatePath(`/candidates/${existing.candidateId}`);
  return { ok: true };
}

/**
 * Recruiter-confirmed verification toggle for a certification. Stamps/clears
 * verifiedAt + verifiedBy (mirrors CandidateReference.contactedBy).
 */
export async function toggleCertificationVerified(
  certificationId: string,
  verified: boolean,
): Promise<MutateResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const existing = await prisma.candidateCertification.findFirst({
    where: { id: certificationId, candidate: { organizationId: orgId } },
    select: { id: true, candidateId: true },
  });
  if (!existing) return { ok: false, error: "Certification not found." };

  await prisma.candidateCertification.update({
    where: { id: existing.id },
    data: {
      verifiedAt: verified ? new Date() : null,
      verifiedById: verified ? session.user.id ?? null : null,
    },
  });
  revalidatePath(`/candidates/${existing.candidateId}`);
  return { ok: true };
}
