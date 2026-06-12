import type { FilterType } from "./column-filter-ops";

export type ColumnKey =
  | "email"
  | "phone"
  | "altEmail"
  | "altPhone"
  | "status"
  | "rating"
  | "tags"
  | "lists"
  | "jobs"
  | "client"
  | "applications"
  | "city"
  | "state"
  | "country"
  | "timezone"
  | "willingToRelocate"
  | "currentTitle"
  | "currentCompany"
  | "yearsExperience"
  | "seniority"
  | "workAuth"
  | "needsSponsorship"
  | "desiredSalary"
  | "currentSalary"
  | "availableFrom"
  | "noticeDays"
  | "remotePref"
  | "employmentTypePref"
  | "industries"
  | "specialties"
  | "source"
  | "sourcedBy"
  | "lastContactedAt"
  | "nextFollowUpAt"
  | "linkedin"
  | "github"
  | "portfolio"
  | "resume"
  | "summary"
  | "createdAt";

export type ColumnDef = {
  key: ColumnKey;
  label: string;
  category: string;
  align?: "left" | "right";
};

export const COLUMN_DEFS: ColumnDef[] = [
  // Core
  { key: "email", label: "Email", category: "Core" },
  { key: "phone", label: "Phone", category: "Core" },
  { key: "status", label: "Status", category: "Core" },
  { key: "tags", label: "Tags", category: "Core" },
  { key: "rating", label: "Rating", category: "Core", align: "right" },
  { key: "lists", label: "Lists", category: "Core" },
  { key: "jobs", label: "Jobs", category: "Core" },
  { key: "client", label: "Client", category: "Core" },
  { key: "applications", label: "Applications", category: "Core", align: "right" },

  // Contact
  { key: "altEmail", label: "Alt email", category: "Contact" },
  { key: "altPhone", label: "Alt phone", category: "Contact" },

  // Location
  { key: "city", label: "City", category: "Location" },
  { key: "state", label: "State", category: "Location" },
  { key: "country", label: "Country", category: "Location" },
  { key: "timezone", label: "Timezone", category: "Location" },
  { key: "willingToRelocate", label: "Will relocate", category: "Location" },

  // Career
  { key: "currentTitle", label: "Current title", category: "Career" },
  { key: "currentCompany", label: "Current company", category: "Career" },
  { key: "yearsExperience", label: "Years exp", category: "Career", align: "right" },
  { key: "seniority", label: "Seniority", category: "Career" },

  // Authorization
  { key: "workAuth", label: "Work auth", category: "Authorization" },
  { key: "needsSponsorship", label: "Sponsorship?", category: "Authorization" },

  // Compensation
  { key: "desiredSalary", label: "Desired salary", category: "Compensation" },
  { key: "currentSalary", label: "Current salary", category: "Compensation", align: "right" },

  // Availability
  { key: "availableFrom", label: "Available from", category: "Availability" },
  { key: "noticeDays", label: "Notice (days)", category: "Availability", align: "right" },
  { key: "remotePref", label: "Remote pref", category: "Availability" },
  { key: "employmentTypePref", label: "Employment type", category: "Availability" },

  // Focus
  { key: "industries", label: "Industries", category: "Focus" },
  { key: "specialties", label: "Specialties", category: "Focus" },

  // Source
  { key: "source", label: "Source", category: "Source" },
  { key: "sourcedBy", label: "Sourced by", category: "Source" },
  { key: "lastContactedAt", label: "Last contacted", category: "Source" },
  { key: "nextFollowUpAt", label: "Next follow-up", category: "Source" },

  // Links
  { key: "linkedin", label: "LinkedIn", category: "Links" },
  { key: "github", label: "GitHub", category: "Links" },
  { key: "portfolio", label: "Portfolio", category: "Links" },
  { key: "resume", label: "Resume", category: "Links" },

  // Misc
  { key: "summary", label: "Summary", category: "Other" },
  { key: "createdAt", label: "Added", category: "Other" },
];

export const DEFAULT_COLUMNS: ColumnKey[] = [
  "email",
  "phone",
  "status",
  "tags",
  "lists",
  "jobs",
  "applications",
];

export const COLUMN_STORAGE_KEY = "ats.candidates.columns.v1";

// ---------------------------------------------------------------------------
// Per-column filter metadata.
//
// Drives the per-header filter popover (type-appropriate operators) in
// CandidatesView. The server (`candidate-filter.ts`) reads the same metadata
// to translate `qcol_<columnKey>=<op>:<payload>` URL params into Prisma
// clauses, so what you filter is exactly what the paginated query returns.
// Columns absent from the map simply aren't filterable.
// ---------------------------------------------------------------------------

export type { FilterType };

// Where the choice picker gets its options (resolved by a server action,
// see column-filter-actions.ts).
export type ChoiceOptionSource =
  | "enum:CandidateStatus"
  | "enum:RemotePref"
  | "enum:WorkAuth"
  | "enum:EmploymentType"
  | "bool"
  | "tags"
  | "lists"
  | "clients"
  | "users"
  | "choice:candidate.source"
  | "choice:candidate.seniority";

export type ColumnFilterSpec =
  | { type: "text"; field: string; array?: boolean; relation?: "jobTitle" }
  | {
      type: "choice";
      field: string;
      variant:
        | "enumScalar"
        | "stringScalar"
        | "enumArray"
        | "stringArray"
        | "boolScalar"
        | "tags"
        | "lists"
        // Candidate → Application → Job → Client; values are client IDs.
        | "client";
      options: ChoiceOptionSource;
      /**
       * Nullable scalar field: "is none of" must OR-in `{ field: null }`,
       * because Postgres `NOT IN (...)` drops NULL rows.
       */
      nullable?: boolean;
    }
  | { type: "number"; field: string }
  | { type: "date"; field: string }
  | { type: "presence"; field: string };

// `name` is the synthetic leading column (firstName + lastName).
export const COLUMN_FILTERS: Partial<Record<ColumnKey | "name", ColumnFilterSpec>> = {
  name: { type: "text", field: "__name__" },
  email: { type: "text", field: "email" },
  phone: { type: "text", field: "phone" },
  altEmail: { type: "text", field: "alternateEmail" },
  altPhone: { type: "text", field: "alternatePhone" },
  status: { type: "choice", field: "status", variant: "enumScalar", options: "enum:CandidateStatus" },
  rating: { type: "number", field: "rating" },
  tags: { type: "choice", field: "tags", variant: "tags", options: "tags" },
  lists: { type: "choice", field: "listMemberships", variant: "lists", options: "lists" },
  jobs: { type: "text", field: "applications", relation: "jobTitle" },
  client: { type: "choice", field: "applications", variant: "client", options: "clients" },
  city: { type: "text", field: "locationCity" },
  state: { type: "text", field: "locationState" },
  country: { type: "text", field: "locationCountry" },
  timezone: { type: "text", field: "timezone" },
  // Boolean column → choice filter with static Yes/No options ("bool" source).
  willingToRelocate: { type: "choice", field: "willingToRelocate", variant: "boolScalar", options: "bool" },
  currentTitle: { type: "text", field: "currentTitle" },
  currentCompany: { type: "text", field: "currentCompany" },
  yearsExperience: { type: "number", field: "yearsExperience" },
  seniority: { type: "choice", field: "seniority", variant: "stringScalar", options: "choice:candidate.seniority", nullable: true },
  workAuth: { type: "choice", field: "workAuthorization", variant: "enumScalar", options: "enum:WorkAuth", nullable: true },
  needsSponsorship: { type: "choice", field: "requiresSponsorship", variant: "boolScalar", options: "bool" },
  desiredSalary: { type: "number", field: "desiredSalaryMin" },
  currentSalary: { type: "number", field: "currentSalary" },
  availableFrom: { type: "date", field: "availableFrom" },
  noticeDays: { type: "number", field: "noticePeriodDays" },
  remotePref: { type: "choice", field: "remotePref", variant: "enumArray", options: "enum:RemotePref" },
  employmentTypePref: { type: "choice", field: "employmentTypePref", variant: "enumArray", options: "enum:EmploymentType" },
  industries: { type: "text", field: "industries", array: true },
  specialties: { type: "text", field: "specialties", array: true },
  source: { type: "choice", field: "source", variant: "stringScalar", options: "choice:candidate.source", nullable: true },
  // Values are user IDs (option labels show the user's name).
  sourcedBy: { type: "choice", field: "sourcedById", variant: "stringScalar", options: "users", nullable: true },
  lastContactedAt: { type: "date", field: "lastContactedAt" },
  nextFollowUpAt: { type: "date", field: "nextFollowUpAt" },
  linkedin: { type: "presence", field: "linkedinUrl" },
  github: { type: "presence", field: "githubUrl" },
  portfolio: { type: "presence", field: "portfolioUrl" },
  resume: { type: "presence", field: "resumeUrl" },
  summary: { type: "text", field: "summary" },
  createdAt: { type: "date", field: "createdAt" },
};

export const FILTER_TYPE_BY_COLUMN: Partial<Record<string, FilterType>> = Object.fromEntries(
  Object.entries(COLUMN_FILTERS).map(([k, v]) => [k, v!.type]),
);

/**
 * Columns the user can sort by. Maps a ColumnKey (plus the synthetic `name`
 * for the leading Name column) to the Candidate scalar field used in Prisma's
 * `orderBy`. The `__name__` sentinel fans out across lastName + firstName.
 * Only scalar columns are sortable — relation/array columns (tags, jobs,
 * lists, industries, …) are intentionally omitted.
 */
export const SORTABLE_FIELDS: Partial<Record<ColumnKey | "name", string>> = {
  name: "__name__",
  email: "email",
  status: "status",
  rating: "rating",
  city: "locationCity",
  state: "locationState",
  country: "locationCountry",
  timezone: "timezone",
  currentTitle: "currentTitle",
  currentCompany: "currentCompany",
  yearsExperience: "yearsExperience",
  seniority: "seniority",
  workAuth: "workAuthorization",
  desiredSalary: "desiredSalaryMin",
  currentSalary: "currentSalary",
  availableFrom: "availableFrom",
  noticeDays: "noticePeriodDays",
  source: "source",
  // Relation sort — buildOrderBy maps the sentinel to { sourcedBy: { name } }.
  sourcedBy: "__sourcedBy__",
  lastContactedAt: "lastContactedAt",
  nextFollowUpAt: "nextFollowUpAt",
  createdAt: "createdAt",
};

export type SortDir = "asc" | "desc";

/**
 * Dedupe the clients behind a candidate's applications (several applications
 * can point at jobs for the same client) into the row shape the Client
 * column renders. Order follows the applications order (newest first).
 */
export function uniqueClients(
  clients: Array<{ id: string; name: string } | null | undefined>,
): { clientId: string; clientName: string }[] {
  const seen = new Map<string, string>();
  for (const cl of clients) {
    if (cl && !seen.has(cl.id)) seen.set(cl.id, cl.name);
  }
  return [...seen].map(([clientId, clientName]) => ({ clientId, clientName }));
}

/**
 * Serialize a column order/visibility list into the `cols` URL param value.
 * The single ordered list encodes both which columns are visible and their
 * left-to-right order.
 */
export function serializeColumns(keys: ColumnKey[]): string {
  return keys.join(",");
}

/**
 * Parse a `cols` URL param value back into a clean ColumnKey list: drops
 * unknown keys (renamed/removed columns) and de-dupes while preserving order.
 * Returns null when there's nothing usable so callers can fall back to a
 * default (e.g. localStorage).
 */
export function parseColumns(
  raw: string | null | undefined,
  knownKeys: Set<string>,
): ColumnKey[] | null {
  if (!raw) return null;
  const seen = new Set<string>();
  const out: ColumnKey[] = [];
  for (const part of raw.split(",")) {
    const k = part.trim();
    if (k && knownKeys.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k as ColumnKey);
    }
  }
  return out.length > 0 ? out : null;
}
