import {
  CandidateSource,
  CandidateStatus,
  EmploymentType,
  RemotePref,
  Seniority,
  WorkAuth,
} from "@/generated/prisma";

export type CandidateRow = Record<string, string>;

/**
 * Canonical CSV column list, in template column order. Each entry's `example`
 * value is what we write into the example row of the downloadable template.
 */
export const CSV_COLUMNS: { key: string; example: string }[] = [
  { key: "firstName", example: "Ada" },
  { key: "lastName", example: "Lovelace" },
  { key: "email", example: "ada@example.com" },
  { key: "preferredName", example: "Ada" },
  { key: "pronouns", example: "she/her" },
  { key: "phone", example: "+1 555-0100" },
  { key: "alternateEmail", example: "" },
  { key: "alternatePhone", example: "" },
  { key: "locationCity", example: "Brooklyn" },
  { key: "locationState", example: "NY" },
  { key: "locationCountry", example: "USA" },
  { key: "timezone", example: "America/New_York" },
  { key: "willingToRelocate", example: "yes" },
  { key: "workAuthorization", example: "US_CITIZEN" },
  { key: "requiresSponsorship", example: "no" },
  { key: "linkedinUrl", example: "https://www.linkedin.com/in/ada" },
  { key: "githubUrl", example: "https://github.com/ada" },
  { key: "portfolioUrl", example: "https://ada.dev" },
  { key: "otherUrls", example: "" },
  { key: "currentTitle", example: "Senior Software Engineer" },
  { key: "currentCompany", example: "Analytical Engines Inc." },
  { key: "yearsExperience", example: "10" },
  { key: "seniority", example: "SENIOR" },
  { key: "desiredSalaryMin", example: "180000" },
  { key: "desiredSalaryMax", example: "220000" },
  { key: "currentSalary", example: "170000" },
  { key: "salaryCurrency", example: "USD" },
  { key: "availableFrom", example: "2026-07-01" },
  { key: "noticePeriodDays", example: "30" },
  { key: "employmentTypePref", example: "FULL_TIME|CONTRACT" },
  { key: "remotePref", example: "REMOTE|HYBRID" },
  { key: "industries", example: "Fintech|SaaS" },
  { key: "specialties", example: "Distributed systems|Payments" },
  { key: "skills", example: "TypeScript|Postgres|Kubernetes" },
  { key: "tags", example: "warm-lead|backend" },
  { key: "source", example: "LINKEDIN" },
  { key: "sourceDetail", example: "InMail outreach" },
  { key: "referredByName", example: "" },
  { key: "status", example: "ACTIVE" },
  { key: "rating", example: "4" },
  { key: "nextFollowUpAt", example: "2026-06-15" },
  { key: "summary", example: "Backend engineer with deep payments experience." },
  { key: "notes", example: "Prefers async comms." },
];

export const CSV_HEADERS = CSV_COLUMNS.map((c) => c.key);

/**
 * Per-cell parsing helpers. Each returns the parsed value or throws with a
 * human-readable message that becomes the row's error.
 */
const TRUE_VALUES = new Set(["yes", "y", "true", "t", "1"]);
const FALSE_VALUES = new Set(["no", "n", "false", "f", "0", ""]);

function parseBool(value: string, field: string): boolean {
  const v = value.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  throw new Error(`${field}: expected yes/no, got "${value}"`);
}

function parseOptionalInt(value: string, field: string, min: number, max: number): number | null {
  const v = value.trim();
  if (!v) return null;
  const cleaned = v.replace(/[,$\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`${field}: "${value}" is not a number`);
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) {
    throw new Error(`${field}: ${rounded} is outside ${min}–${max}`);
  }
  return rounded;
}

function parseOptionalDate(value: string, field: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${field}: "${value}" is not a valid date (use YYYY-MM-DD)`);
  }
  return d;
}

function parseOptionalEnum<T extends Record<string, string>>(
  value: string,
  field: string,
  e: T,
): T[keyof T] | null {
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (!(v in e)) {
    throw new Error(`${field}: "${value}" is not one of ${Object.keys(e).join(", ")}`);
  }
  return e[v as keyof T];
}

function parseEnumArray<T extends Record<string, string>>(
  value: string,
  field: string,
  e: T,
): T[keyof T][] {
  if (!value.trim()) return [];
  return value
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((raw) => {
      const upper = raw.toUpperCase();
      if (!(upper in e)) {
        throw new Error(`${field}: "${raw}" is not one of ${Object.keys(e).join(", ")}`);
      }
      return e[upper as keyof T];
    });
}

function parseStringList(value: string, maxLen: number): string[] {
  if (!value.trim()) return [];
  return Array.from(
    new Set(
      value
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= maxLen),
    ),
  );
}

function parseOptionalUrl(value: string, field: string, max: number): string | null {
  const v = value.trim();
  if (!v) return null;
  const normalized = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    new URL(normalized);
  } catch {
    throw new Error(`${field}: "${value}" is not a valid URL`);
  }
  if (normalized.length > max) {
    throw new Error(`${field}: URL is too long (max ${max} chars)`);
  }
  return normalized;
}

function parseOptionalString(value: string, field: string, max: number): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.length > max) throw new Error(`${field}: too long (max ${max} chars)`);
  return v;
}

function parseRequiredString(value: string, field: string, max: number): string {
  const parsed = parseOptionalString(value, field, max);
  if (parsed === null) throw new Error(`${field} is required`);
  return parsed;
}

function parseEmail(value: string, field: string): string {
  const v = value.trim().toLowerCase();
  if (!v) throw new Error(`${field} is required`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new Error(`${field}: "${value}" is not a valid email`);
  }
  return v;
}

function parseOptionalEmail(value: string, field: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new Error(`${field}: "${value}" is not a valid email`);
  }
  return v;
}

export type ParsedCandidateRow = {
  email: string;
  data: {
    firstName: string;
    lastName: string;
    email: string;
    preferredName: string | null;
    pronouns: string | null;
    phone: string | null;
    alternateEmail: string | null;
    alternatePhone: string | null;
    locationCity: string | null;
    locationState: string | null;
    locationCountry: string | null;
    timezone: string | null;
    willingToRelocate: boolean;
    workAuthorization: WorkAuth | null;
    requiresSponsorship: boolean;
    linkedinUrl: string | null;
    githubUrl: string | null;
    portfolioUrl: string | null;
    otherUrls: string[];
    currentTitle: string | null;
    currentCompany: string | null;
    yearsExperience: number | null;
    seniority: Seniority | null;
    desiredSalaryMin: number | null;
    desiredSalaryMax: number | null;
    currentSalary: number | null;
    salaryCurrency: string;
    availableFrom: Date | null;
    noticePeriodDays: number | null;
    employmentTypePref: EmploymentType[];
    remotePref: RemotePref[];
    industries: string[];
    specialties: string[];
    skills: string[];
    source: CandidateSource | null;
    sourceDetail: string | null;
    referredByName: string | null;
    status: CandidateStatus;
    rating: number | null;
    nextFollowUpAt: Date | null;
    summary: string | null;
    notes: string | null;
  };
  tags: string[];
};

/**
 * Parse a single CSV row (header → cell map) into a normalized payload ready
 * for `prisma.candidate.create`. Throws Error with a human-readable message
 * if any cell fails validation.
 */
export function parseCandidateRow(row: CandidateRow): ParsedCandidateRow {
  const cell = (key: string): string => row[key] ?? "";

  const firstName = parseRequiredString(cell("firstName"), "firstName", 80);
  const lastName = parseRequiredString(cell("lastName"), "lastName", 80);
  const email = parseEmail(cell("email"), "email");

  const currency = cell("salaryCurrency").trim().toUpperCase() || "USD";

  return {
    email,
    tags: parseStringList(cell("tags"), 60),
    data: {
      firstName,
      lastName,
      email,
      preferredName: parseOptionalString(cell("preferredName"), "preferredName", 80),
      pronouns: parseOptionalString(cell("pronouns"), "pronouns", 40),
      phone: parseOptionalString(cell("phone"), "phone", 40),
      alternateEmail: parseOptionalEmail(cell("alternateEmail"), "alternateEmail"),
      alternatePhone: parseOptionalString(cell("alternatePhone"), "alternatePhone", 40),
      locationCity: parseOptionalString(cell("locationCity"), "locationCity", 120),
      locationState: parseOptionalString(cell("locationState"), "locationState", 120),
      locationCountry: parseOptionalString(cell("locationCountry"), "locationCountry", 120),
      timezone: parseOptionalString(cell("timezone"), "timezone", 60),
      willingToRelocate: parseBool(cell("willingToRelocate"), "willingToRelocate"),
      workAuthorization: parseOptionalEnum(cell("workAuthorization"), "workAuthorization", WorkAuth),
      requiresSponsorship: parseBool(cell("requiresSponsorship"), "requiresSponsorship"),
      linkedinUrl: parseOptionalUrl(cell("linkedinUrl"), "linkedinUrl", 300),
      githubUrl: parseOptionalUrl(cell("githubUrl"), "githubUrl", 300),
      portfolioUrl: parseOptionalUrl(cell("portfolioUrl"), "portfolioUrl", 300),
      otherUrls: parseStringList(cell("otherUrls"), 300),
      currentTitle: parseOptionalString(cell("currentTitle"), "currentTitle", 160),
      currentCompany: parseOptionalString(cell("currentCompany"), "currentCompany", 160),
      yearsExperience: parseOptionalInt(cell("yearsExperience"), "yearsExperience", 0, 80),
      seniority: parseOptionalEnum(cell("seniority"), "seniority", Seniority),
      desiredSalaryMin: parseOptionalInt(cell("desiredSalaryMin"), "desiredSalaryMin", 0, 100_000_000),
      desiredSalaryMax: parseOptionalInt(cell("desiredSalaryMax"), "desiredSalaryMax", 0, 100_000_000),
      currentSalary: parseOptionalInt(cell("currentSalary"), "currentSalary", 0, 100_000_000),
      salaryCurrency: currency.length >= 3 && currency.length <= 8 ? currency : "USD",
      availableFrom: parseOptionalDate(cell("availableFrom"), "availableFrom"),
      noticePeriodDays: parseOptionalInt(cell("noticePeriodDays"), "noticePeriodDays", 0, 365),
      employmentTypePref: parseEnumArray(cell("employmentTypePref"), "employmentTypePref", EmploymentType),
      remotePref: parseEnumArray(cell("remotePref"), "remotePref", RemotePref),
      industries: parseStringList(cell("industries"), 120),
      specialties: parseStringList(cell("specialties"), 120),
      skills: parseStringList(cell("skills"), 80),
      source: parseOptionalEnum(cell("source"), "source", CandidateSource),
      sourceDetail: parseOptionalString(cell("sourceDetail"), "sourceDetail", 200),
      referredByName: parseOptionalString(cell("referredByName"), "referredByName", 160),
      status:
        parseOptionalEnum(cell("status"), "status", CandidateStatus) ?? CandidateStatus.ACTIVE,
      rating: parseOptionalInt(cell("rating"), "rating", 1, 5),
      nextFollowUpAt: parseOptionalDate(cell("nextFollowUpAt"), "nextFollowUpAt"),
      summary: parseOptionalString(cell("summary"), "summary", 1000),
      notes: parseOptionalString(cell("notes"), "notes", 5000),
    },
  };
}
