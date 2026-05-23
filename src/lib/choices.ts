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
 * Idempotent. Inserts the default options for a field if it has none yet.
 * Lets us avoid a separate seed script — the first visit to /settings/choices
 * (or first read of options for a field) just lazily fills the table.
 */
export async function ensureChoiceDefaults(field: string, defaults: readonly string[]) {
  const existing = await prisma.choiceOption.count({ where: { field } });
  if (existing > 0) return;
  await prisma.choiceOption.createMany({
    data: defaults.map((name, index) => ({ field, name, sortOrder: index })),
    skipDuplicates: true,
  });
}

export async function loadChoiceOptions(field: string): Promise<ChoiceOptionRow[]> {
  return prisma.choiceOption.findMany({
    where: { field, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, field: true, name: true, sortOrder: true, active: true },
  });
}
