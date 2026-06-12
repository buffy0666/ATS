import { prisma } from "@/lib/prisma";

/**
 * Field identifiers used in the ChoiceOption registry. Adding a new entry here
 * is the first step to making a choice field user-editable.
 */
export const CHOICE_FIELDS = {
  candidateSource: {
    key: "candidate.source",
    label: "Candidate source",
    helper: "Where this candidate came from — LinkedIn, referral, job board, etc.",
    defaults: [
      "LINKEDIN",
      "REFERRAL",
      "JOB_BOARD",
      "AGENCY",
      "INBOUND",
      "OUTBOUND",
      "CAREER_SITE",
      "EVENT",
      "RECRUITER_NETWORK",
      "OTHER",
    ],
  },
  candidateSeniority: {
    key: "candidate.seniority",
    label: "Seniority",
    helper: "Career level — entry, senior, staff, director, etc.",
    defaults: [
      "INTERN",
      "ENTRY",
      "JUNIOR",
      "MID",
      "SENIOR",
      "STAFF",
      "PRINCIPAL",
      "LEAD",
      "MANAGER",
      "SENIOR_MANAGER",
      "DIRECTOR",
      "VP",
      "C_LEVEL",
    ],
  },
  candidateRejectionReason: {
    key: "candidate.rejectionReason",
    label: "Rejection reason",
    helper: "Why a candidate declined or passed — salary, location, timing, etc.",
    defaults: [
      "Compensation",
      "Location / Relocation",
      "Remote Policy",
      "Role Fit",
      "Timing",
      "Accepted Another Offer",
      "Counteroffer",
      "Company / Industry Fit",
      "Visa / Sponsorship",
      "Contract vs Perm",
      "Benefits",
      "Other",
    ],
  },
  candidateEducationDegree: {
    key: "candidate.educationDegree",
    label: "Degree level",
    helper: "Level of an education record — diploma, bachelor's, master's, doctorate, etc.",
    defaults: [
      "HIGH_SCHOOL",
      "GED",
      "SOME_COLLEGE",
      "VOCATIONAL",
      "BOOTCAMP",
      "ASSOCIATE",
      "BACHELORS",
      "POSTGRAD_CERTIFICATE",
      "MASTERS",
      "MBA",
      "PROFESSIONAL",
      "DOCTORATE",
      "POSTDOCTORATE",
      "CERTIFICATE",
      "OTHER",
    ],
  },
  candidateCertificationKind: {
    key: "candidate.certificationKind",
    label: "Certification kind",
    helper: "What kind of credential this is — certification, license, clearance, or membership.",
    defaults: [
      "CERTIFICATION",
      "LICENSE",
      "SECURITY_CLEARANCE",
      "ACCREDITATION",
      "MEMBERSHIP",
      "OTHER",
    ],
  },
} as const;

export type ChoiceFieldKey = (typeof CHOICE_FIELDS)[keyof typeof CHOICE_FIELDS]["key"];

export type ChoiceOptionRow = {
  id: string;
  field: string;
  name: string;
  sortOrder: number;
  active: boolean;
};

/**
 * Idempotent. Inserts the default options for a field if the caller's org
 * has none yet. Lets us avoid a separate seed script — the first visit to
 * /settings/choices (or first read of options for a field) just lazily fills
 * the table for that tenant.
 *
 * orgId is nullable to support callers that legitimately have no org
 * (env-driven dev runs, etc.). Pre-Phase 6 there is also a global
 * (field, name) unique index, so the createMany may need to silently skip
 * duplicates if another org has already inserted the same default — that's
 * fine, the row belongs to the other org and this one will still get a
 * coherent set via the existing-count check.
 */
export async function ensureChoiceDefaults(
  field: string,
  defaults: readonly string[],
  orgId: string | null,
) {
  const existing = await prisma.choiceOption.count({
    where: { field, organizationId: orgId },
  });
  if (existing > 0) return;
  await prisma.choiceOption.createMany({
    data: defaults.map((name, index) => ({
      field,
      name,
      sortOrder: index,
      organizationId: orgId,
    })),
    skipDuplicates: true,
  });
}

export async function loadChoiceOptions(
  field: string,
  orgId: string | null,
): Promise<ChoiceOptionRow[]> {
  return prisma.choiceOption.findMany({
    where: { field, active: true, organizationId: orgId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, field: true, name: true, sortOrder: true, active: true },
  });
}
