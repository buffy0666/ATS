// Source of truth for the editable fields shown in the candidate Profile
// section and their default grouping. Drives both the default layout and the
// layout editor's "available fields" tray. Read-only details and special
// blocks (Jobs, Summary, Resume, Custom Fields, Rating, Status) are
// intentionally not listed here — they're fixed and rendered outside the
// managed layout.

export const PROFILE_LAYOUT_STORAGE_KEY = "ats.candidates.profile-layout.v1";

export type ProfileFieldKey =
  | "firstName"
  | "lastName"
  | "preferredName"
  | "pronouns"
  | "email"
  | "alternateEmail"
  | "phone"
  | "alternatePhone"
  | "locationCity"
  | "locationState"
  | "locationCountry"
  | "timezone"
  | "willingToRelocate"
  | "workAuthorization"
  | "requiresSponsorship"
  | "currentTitle"
  | "currentCompany"
  | "yearsExperience"
  | "seniority"
  | "desiredSalaryMin"
  | "desiredSalaryMax"
  | "currentSalary"
  | "salaryCurrency"
  | "availableFrom"
  | "noticePeriodDays"
  | "employmentTypePref"
  | "remotePref"
  | "industries"
  | "specialties"
  | "skills"
  | "linkedinUrl"
  | "githubUrl"
  | "portfolioUrl"
  | "otherUrls"
  | "source"
  | "sourceDetail"
  | "nextFollowUpAt";

export const PROFILE_FIELD_LABELS: Record<ProfileFieldKey, string> = {
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  pronouns: "Pronouns",
  email: "Email",
  alternateEmail: "Alternate email",
  phone: "Phone",
  alternatePhone: "Alternate phone",
  locationCity: "City",
  locationState: "State / region",
  locationCountry: "Country",
  timezone: "Timezone",
  willingToRelocate: "Open to relocation",
  workAuthorization: "Work authorization",
  requiresSponsorship: "Requires sponsorship",
  currentTitle: "Current title",
  currentCompany: "Current company",
  yearsExperience: "Years of experience",
  seniority: "Seniority",
  desiredSalaryMin: "Desired salary (min)",
  desiredSalaryMax: "Desired salary (max)",
  currentSalary: "Current salary",
  salaryCurrency: "Currency",
  availableFrom: "Available from",
  noticePeriodDays: "Notice period (days)",
  employmentTypePref: "Employment type",
  remotePref: "Work mode",
  industries: "Industries",
  specialties: "Specialties",
  skills: "Skills",
  linkedinUrl: "LinkedIn",
  githubUrl: "GitHub",
  portfolioUrl: "Portfolio",
  otherUrls: "Other URLs",
  source: "Source",
  sourceDetail: "Source detail",
  nextFollowUpAt: "Next follow-up",
};

export type ProfileLayoutSection = { title: string; fields: ProfileFieldKey[] };
export type ProfileLayoutConfig = { sections: ProfileLayoutSection[] };

// The out-of-the-box arrangement — mirrors the original hard-coded grouping.
export const DEFAULT_PROFILE_LAYOUT: ProfileLayoutConfig = {
  sections: [
    { title: "Identity", fields: ["firstName", "lastName", "preferredName", "pronouns"] },
    { title: "Contact", fields: ["email", "alternateEmail", "phone", "alternatePhone"] },
    {
      title: "Location & work authorization",
      fields: [
        "locationCity",
        "locationState",
        "locationCountry",
        "timezone",
        "willingToRelocate",
        "workAuthorization",
        "requiresSponsorship",
      ],
    },
    { title: "Career", fields: ["currentTitle", "currentCompany", "yearsExperience", "seniority"] },
    {
      title: "Compensation & availability",
      fields: [
        "desiredSalaryMin",
        "desiredSalaryMax",
        "currentSalary",
        "salaryCurrency",
        "availableFrom",
        "noticePeriodDays",
        "employmentTypePref",
        "remotePref",
      ],
    },
    { title: "Focus", fields: ["industries", "specialties", "skills"] },
    { title: "Links", fields: ["linkedinUrl", "githubUrl", "portfolioUrl", "otherUrls"] },
    {
      title: "Source & ownership",
      fields: ["source", "sourceDetail", "nextFollowUpAt"],
    },
  ],
};

export const ALL_PROFILE_FIELD_KEYS = Object.keys(PROFILE_FIELD_LABELS) as ProfileFieldKey[];

function isProfileFieldKey(v: unknown): v is ProfileFieldKey {
  return typeof v === "string" && v in PROFILE_FIELD_LABELS;
}

/**
 * Coerce an untrusted value (from localStorage or the DB `config` column) into
 * a valid ProfileLayoutConfig: drop unknown/duplicate keys, drop empty/invalid
 * sections, and keep section titles as plain strings. Returns null if the
 * shape is unusable so callers can fall back to the default.
 */
export function sanitizeProfileLayout(raw: unknown): ProfileLayoutConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const sectionsRaw = (raw as { sections?: unknown }).sections;
  if (!Array.isArray(sectionsRaw)) return null;

  const seen = new Set<ProfileFieldKey>();
  const sections: ProfileLayoutSection[] = [];
  for (const s of sectionsRaw) {
    if (!s || typeof s !== "object") continue;
    const title = (s as { title?: unknown }).title;
    const fieldsRaw = (s as { fields?: unknown }).fields;
    if (typeof title !== "string" || !Array.isArray(fieldsRaw)) continue;
    const fields: ProfileFieldKey[] = [];
    for (const f of fieldsRaw) {
      if (isProfileFieldKey(f) && !seen.has(f)) {
        seen.add(f);
        fields.push(f);
      }
    }
    sections.push({ title: title.slice(0, 80), fields });
  }
  if (sections.length === 0) return null;
  return { sections };
}

/** Parse a JSON string config; falls back to the default layout on any error. */
export function parseProfileLayout(json: string | null | undefined): ProfileLayoutConfig {
  if (!json) return DEFAULT_PROFILE_LAYOUT;
  try {
    return sanitizeProfileLayout(JSON.parse(json)) ?? DEFAULT_PROFILE_LAYOUT;
  } catch {
    return DEFAULT_PROFILE_LAYOUT;
  }
}
