import {
  CandidateStatus,
  EmploymentType,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";

/**
 * Field catalog for the bulk "Edit fields…" action on the candidates list.
 *
 * Deliberately excludes free-text fields (name, email, phone, summary, notes,
 * salary, etc.) — setting those to one shared value across many candidates is
 * never what you want. Only bounded fields appear here:
 *   - enumSelect  : single-choice fixed enum (Status, Work authorization)
 *   - choiceSelect: user-editable ChoiceOption registry (Source, Seniority) —
 *                   pick an existing option OR add a new one in the moment
 *   - enumMulti   : multi-choice fixed enum (Work mode, Employment type)
 *   - rating      : 1–5 stars (or cleared)
 *   - bool        : yes / no
 *
 * This module is plain (no "use server", no prisma import) so it can be shared
 * by both the client toolbar and the server action. The ChoiceOption field
 * keys are inlined as string literals rather than imported from lib/choices.ts
 * (which imports prisma) so this stays client-bundle-safe.
 */

export const SOURCE_CHOICE_FIELD = "candidate.source";
export const SENIORITY_CHOICE_FIELD = "candidate.seniority";

export type BulkEditFieldType =
  | "enumSelect"
  | "choiceSelect"
  | "enumMulti"
  | "rating"
  | "bool";

export type BulkEditOption = { value: string; label: string };

export type BulkEditFieldDef = {
  /** Candidate column name. */
  key: string;
  label: string;
  type: BulkEditFieldType;
  /** Whether the field can be cleared (set to null / empty array). */
  nullable?: boolean;
  /** Static options for enumSelect / enumMulti / rating. */
  options?: BulkEditOption[];
  /** ChoiceOption registry field key for choiceSelect. */
  choiceField?: string;
};

function humanize(v: string): string {
  return v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function enumOptions(e: Record<string, string>): BulkEditOption[] {
  return Object.values(e).map((v) => ({ value: v, label: humanize(v) }));
}

export const BULK_EDIT_FIELDS: BulkEditFieldDef[] = [
  {
    key: "status",
    label: "Status",
    type: "enumSelect",
    options: enumOptions(CandidateStatus as unknown as Record<string, string>),
  },
  {
    key: "source",
    label: "Source",
    type: "choiceSelect",
    nullable: true,
    choiceField: SOURCE_CHOICE_FIELD,
  },
  {
    key: "seniority",
    label: "Seniority",
    type: "choiceSelect",
    nullable: true,
    choiceField: SENIORITY_CHOICE_FIELD,
  },
  {
    key: "workAuthorization",
    label: "Work authorization",
    type: "enumSelect",
    nullable: true,
    options: enumOptions(WorkAuth as unknown as Record<string, string>),
  },
  {
    key: "remotePref",
    label: "Work mode",
    type: "enumMulti",
    options: enumOptions(RemotePref as unknown as Record<string, string>),
  },
  {
    key: "employmentTypePref",
    label: "Employment type",
    type: "enumMulti",
    options: enumOptions(EmploymentType as unknown as Record<string, string>),
  },
  {
    key: "rating",
    label: "Rating",
    type: "rating",
    nullable: true,
    options: [1, 2, 3, 4, 5].map((n) => ({
      value: String(n),
      label: `${"★".repeat(n)} (${n})`,
    })),
  },
  {
    key: "willingToRelocate",
    label: "Open to relocation",
    type: "bool",
  },
  {
    key: "requiresSponsorship",
    label: "Requires sponsorship",
    type: "bool",
  },
];

export function getBulkEditField(key: string): BulkEditFieldDef | undefined {
  return BULK_EDIT_FIELDS.find((f) => f.key === key);
}
