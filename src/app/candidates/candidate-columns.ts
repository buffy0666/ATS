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

/**
 * Per-column quick-filter map: ColumnKey -> Candidate prisma field used
 * for a case-insensitive `contains` filter on the row above the table
 * header. The synthetic `__name__` sentinel fans out across firstName +
 * lastName for the leading Name column. Only text-typed columns are
 * listed here — numeric/enum/date filters live in AdvancedFilters.
 */
export const QUICK_FILTER_FIELDS: Partial<Record<ColumnKey | "name", string>> = {
  name: "__name__",
  email: "email",
  phone: "phone",
  altEmail: "alternateEmail",
  altPhone: "alternatePhone",
  city: "locationCity",
  state: "locationState",
  country: "locationCountry",
  timezone: "timezone",
  currentTitle: "currentTitle",
  currentCompany: "currentCompany",
  seniority: "seniority",
  source: "source",
  summary: "summary",
  linkedin: "linkedinUrl",
  github: "githubUrl",
  portfolio: "portfolioUrl",
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
  lastContactedAt: "lastContactedAt",
  nextFollowUpAt: "nextFollowUpAt",
  createdAt: "createdAt",
};

export type SortDir = "asc" | "desc";

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
