// Shared (client- AND server-safe) configuration for the candidate merge
// compare screen. NO "use server" / server-only imports here — both
// `MergeClient.tsx` (client) and `actions.ts` (server) import this so the
// list of winner-pickable fields stays in lockstep.
//
// Only SCALAR / ARRAY / JSON profile fields that the user picks a single
// winner for live here. Fields with their own merge rule are handled
// directly in `actions.ts` and are intentionally NOT listed:
//   - `notes` (legacy free-text)  → concatenated, never picked.
//   - `lastContactedAt`           → most-recent of the two, never picked.
//   - `nextFollowUpAt`            → soonest upcoming, never picked.
// Relations (notes, emails, applications, …) are combined/transferred, not
// picked — see the merge action.

export type MergeFieldKind =
  | "text"
  | "longtext"
  | "url"
  | "bool"
  | "number"
  | "select"
  | "date"
  | "array"
  | "json";

export type MergeFieldGroup =
  | "Identity"
  | "Contact"
  | "Location & work authorization"
  | "Career"
  | "Compensation & availability"
  | "Focus"
  | "Links"
  | "Source & ownership"
  | "Skills & resume";

export type MergeField = {
  /** Must match the Candidate model field name exactly. */
  key: string;
  label: string;
  group: MergeFieldGroup;
  kind: MergeFieldKind;
};

/**
 * `email` is special: it carries a `@@unique([organizationId, email])`
 * constraint, so when the SECONDARY's email wins the merge action sets it
 * on the primary only AFTER the secondary row is deleted (otherwise P2002).
 * The field is still user-pickable here; the special-casing is purely in
 * the transaction ordering.
 */
export const EMAIL_FIELD_KEY = "email";

export const MERGE_FIELD_GROUPS: MergeFieldGroup[] = [
  "Identity",
  "Contact",
  "Location & work authorization",
  "Career",
  "Compensation & availability",
  "Focus",
  "Links",
  "Source & ownership",
  "Skills & resume",
];

export const MERGE_FIELDS: MergeField[] = [
  // Identity
  { key: "firstName", label: "First name", group: "Identity", kind: "text" },
  { key: "lastName", label: "Last name", group: "Identity", kind: "text" },
  { key: "preferredName", label: "Preferred name", group: "Identity", kind: "text" },
  { key: "pronouns", label: "Pronouns", group: "Identity", kind: "text" },

  // Contact
  { key: "email", label: "Email", group: "Contact", kind: "text" },
  { key: "alternateEmail", label: "Alternate email", group: "Contact", kind: "text" },
  { key: "phone", label: "Phone", group: "Contact", kind: "text" },
  { key: "alternatePhone", label: "Alternate phone", group: "Contact", kind: "text" },

  // Location & work authorization
  { key: "locationCity", label: "City", group: "Location & work authorization", kind: "text" },
  { key: "locationState", label: "State / region", group: "Location & work authorization", kind: "text" },
  { key: "locationCountry", label: "Country", group: "Location & work authorization", kind: "text" },
  { key: "timezone", label: "Timezone", group: "Location & work authorization", kind: "text" },
  { key: "willingToRelocate", label: "Open to relocation", group: "Location & work authorization", kind: "bool" },
  { key: "workAuthorization", label: "Work authorization", group: "Location & work authorization", kind: "select" },
  { key: "requiresSponsorship", label: "Requires sponsorship", group: "Location & work authorization", kind: "bool" },

  // Career
  { key: "currentTitle", label: "Current title", group: "Career", kind: "text" },
  { key: "currentCompany", label: "Current company", group: "Career", kind: "text" },
  { key: "yearsExperience", label: "Years of experience", group: "Career", kind: "number" },
  { key: "seniority", label: "Seniority", group: "Career", kind: "select" },

  // Compensation & availability
  { key: "desiredSalaryMin", label: "Desired salary (min)", group: "Compensation & availability", kind: "number" },
  { key: "desiredSalaryMax", label: "Desired salary (max)", group: "Compensation & availability", kind: "number" },
  { key: "currentSalary", label: "Current salary", group: "Compensation & availability", kind: "number" },
  { key: "salaryCurrency", label: "Currency", group: "Compensation & availability", kind: "text" },
  { key: "availableFrom", label: "Available from", group: "Compensation & availability", kind: "date" },
  { key: "noticePeriodDays", label: "Notice period (days)", group: "Compensation & availability", kind: "number" },
  { key: "employmentTypePref", label: "Employment type", group: "Compensation & availability", kind: "array" },
  { key: "remotePref", label: "Work mode", group: "Compensation & availability", kind: "array" },

  // Focus
  { key: "industries", label: "Industries", group: "Focus", kind: "array" },
  { key: "specialties", label: "Specialties", group: "Focus", kind: "array" },

  // Links
  { key: "linkedinUrl", label: "LinkedIn", group: "Links", kind: "url" },
  { key: "githubUrl", label: "GitHub", group: "Links", kind: "url" },
  { key: "portfolioUrl", label: "Portfolio", group: "Links", kind: "url" },
  { key: "otherUrls", label: "Other URLs", group: "Links", kind: "array" },

  // Source & ownership
  { key: "status", label: "Status", group: "Source & ownership", kind: "select" },
  { key: "rating", label: "Rating", group: "Source & ownership", kind: "number" },
  { key: "source", label: "Source", group: "Source & ownership", kind: "select" },
  { key: "sourceDetail", label: "Source detail", group: "Source & ownership", kind: "text" },

  // Skills & resume
  { key: "summary", label: "Summary", group: "Skills & resume", kind: "longtext" },
  { key: "skills", label: "Skills", group: "Skills & resume", kind: "array" },
  { key: "workHistory", label: "Work history", group: "Skills & resume", kind: "json" },
  { key: "education", label: "Education", group: "Skills & resume", kind: "json" },
];

/** Quick lookup of a field's config by key. */
export const MERGE_FIELD_BY_KEY: Record<string, MergeField> = Object.fromEntries(
  MERGE_FIELDS.map((f) => [f.key, f]),
);

export type FieldWinner = "primary" | "secondary";
