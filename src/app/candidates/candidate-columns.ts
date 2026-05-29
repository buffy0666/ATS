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
