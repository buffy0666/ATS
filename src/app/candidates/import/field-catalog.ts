/**
 * Catalog of the candidate fields the importer can target, with human
 * labels, required flags, and synonyms used to auto-match an arbitrary
 * input file's headers. Pure module — imported by both the client mapping
 * UI and the server import action.
 */

export type ImportField = {
  /** Canonical key — matches the keys parseCandidateRow() reads. */
  key: string;
  /** Human label shown on the left side of the mapping table. */
  label: string;
  /** firstName / lastName / email — must be mapped to import a row. */
  required: boolean;
  /** Header spellings we auto-match against (besides key + label). */
  synonyms: string[];
  /** Short hint shown under the label for format-sensitive fields. */
  hint?: string;
};

export const IMPORT_FIELDS: ImportField[] = [
  { key: "firstName", label: "First name", required: true, synonyms: ["first", "fname", "given name", "givenname"] },
  { key: "lastName", label: "Last name", required: true, synonyms: ["last", "lname", "surname", "family name", "familyname"] },
  { key: "email", label: "Email", required: true, synonyms: ["email address", "e-mail", "mail", "work email", "primary email"] },
  { key: "preferredName", label: "Preferred name", required: false, synonyms: ["nickname", "goes by"] },
  { key: "pronouns", label: "Pronouns", required: false, synonyms: [] },
  { key: "phone", label: "Phone", required: false, synonyms: ["phone number", "mobile", "cell", "telephone", "tel"] },
  { key: "alternateEmail", label: "Alternate email", required: false, synonyms: ["secondary email", "personal email", "other email"] },
  { key: "alternatePhone", label: "Alternate phone", required: false, synonyms: ["secondary phone", "other phone", "home phone"] },
  { key: "locationCity", label: "City", required: false, synonyms: ["town", "city name"] },
  { key: "locationState", label: "State / region", required: false, synonyms: ["state", "province", "region"] },
  { key: "locationCountry", label: "Country", required: false, synonyms: ["nation"] },
  { key: "timezone", label: "Timezone", required: false, synonyms: ["tz", "time zone"] },
  { key: "willingToRelocate", label: "Willing to relocate", required: false, synonyms: ["relocate", "open to relocation"], hint: "yes / no" },
  { key: "workAuthorization", label: "Work authorization", required: false, synonyms: ["work auth", "visa status", "authorization", "work eligibility"], hint: "enum (US_CITIZEN, H1B, …)" },
  { key: "requiresSponsorship", label: "Requires sponsorship", required: false, synonyms: ["sponsorship", "needs sponsorship", "visa sponsorship"], hint: "yes / no" },
  { key: "linkedinUrl", label: "LinkedIn URL", required: false, synonyms: ["linkedin", "li", "linkedin profile", "linkedin link"] },
  { key: "githubUrl", label: "GitHub URL", required: false, synonyms: ["github", "gh", "git"] },
  { key: "portfolioUrl", label: "Portfolio URL", required: false, synonyms: ["portfolio", "website", "personal site", "web"] },
  { key: "otherUrls", label: "Other URLs", required: false, synonyms: ["links", "other links"], hint: "pipe-separated" },
  { key: "currentTitle", label: "Current title", required: false, synonyms: ["title", "job title", "position", "role", "headline"] },
  { key: "currentCompany", label: "Current company", required: false, synonyms: ["company", "employer", "organization", "current employer"] },
  { key: "yearsExperience", label: "Years of experience", required: false, synonyms: ["yoe", "experience", "years exp", "exp years"] },
  { key: "seniority", label: "Seniority", required: false, synonyms: ["level", "seniority level", "career level"] },
  { key: "desiredSalaryMin", label: "Desired salary (min)", required: false, synonyms: ["salary min", "min salary", "expected salary min", "comp min"] },
  { key: "desiredSalaryMax", label: "Desired salary (max)", required: false, synonyms: ["salary max", "max salary", "expected salary max", "comp max"] },
  { key: "currentSalary", label: "Current salary", required: false, synonyms: ["salary", "current comp", "compensation", "base salary"] },
  { key: "salaryCurrency", label: "Salary currency", required: false, synonyms: ["currency", "comp currency"], hint: "e.g. USD" },
  { key: "availableFrom", label: "Available from", required: false, synonyms: ["start date", "availability", "available date"], hint: "YYYY-MM-DD" },
  { key: "noticePeriodDays", label: "Notice period (days)", required: false, synonyms: ["notice", "notice period", "notice days"] },
  { key: "employmentTypePref", label: "Employment type pref", required: false, synonyms: ["employment type", "work type", "engagement type"], hint: "pipe-separated enum" },
  { key: "remotePref", label: "Remote preference", required: false, synonyms: ["remote", "work mode", "remote preference"], hint: "pipe-separated enum" },
  { key: "industries", label: "Industries", required: false, synonyms: ["industry", "verticals", "sectors"], hint: "pipe-separated" },
  { key: "specialties", label: "Specialties", required: false, synonyms: ["specialty", "focus areas", "expertise"], hint: "pipe-separated" },
  { key: "skills", label: "Skills", required: false, synonyms: ["skill", "tech stack", "technologies", "tools"], hint: "pipe-separated" },
  { key: "tags", label: "Tags", required: false, synonyms: ["tag", "labels"], hint: "pipe-separated" },
  { key: "source", label: "Source", required: false, synonyms: ["lead source", "candidate source", "channel"] },
  { key: "sourceDetail", label: "Source detail", required: false, synonyms: ["source notes", "source info"] },
  { key: "referredByName", label: "Referred by", required: false, synonyms: ["referrer", "referral", "referred by name"] },
  { key: "status", label: "Status", required: false, synonyms: ["candidate status", "stage"], hint: "enum (ACTIVE, …)" },
  { key: "rating", label: "Rating", required: false, synonyms: ["score", "stars"], hint: "1–5" },
  { key: "nextFollowUpAt", label: "Next follow-up", required: false, synonyms: ["follow up", "followup date", "next contact"], hint: "YYYY-MM-DD" },
  { key: "summary", label: "Summary", required: false, synonyms: ["bio", "about", "profile summary"] },
  { key: "notes", label: "Notes", required: false, synonyms: ["note", "comments", "remarks"] },
];

export const REQUIRED_FIELD_KEYS = IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key);

/** A field→inputHeader mapping. Absent keys / null = skip that field. */
export type FieldMapping = Record<string, string | null>;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Turn an arbitrary CSV header into a valid CustomField key:
 * `^[a-z][a-z0-9_]*$`, lowercased, non-alphanumerics collapsed to `_`,
 * leading digit prefixed with `f_`. Empty input falls back to "field".
 */
export function slugifyFieldKey(header: string): string {
  let key = header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  if (!key) key = "field";
  if (/^[0-9]/.test(key)) key = `f_${key}`.slice(0, 60);
  return key;
}

/**
 * Best-effort auto-match of the input file's headers to canonical fields.
 *
 * Two passes, each consuming headers so one input column maps to at most
 * one field:
 *   1. Exact (normalized) match against key / label / synonyms.
 *   2. Substring match (input header contains a candidate token or vice
 *      versa) for the still-unmatched fields.
 *
 * Returns a mapping keyed by canonical field; unmatched fields are absent
 * (the UI shows them as "Skip").
 */
export function autoMatchFields(inputHeaders: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  const used = new Set<string>();
  const norm = inputHeaders.map((h) => ({ raw: h, n: normalize(h) }));

  const candidatesFor = (f: ImportField) =>
    [f.key, f.label, ...f.synonyms].map(normalize).filter(Boolean);

  // Pass 1 — exact normalized equality.
  for (const field of IMPORT_FIELDS) {
    const cands = candidatesFor(field);
    const hit = norm.find((h) => !used.has(h.raw) && cands.includes(h.n));
    if (hit) {
      mapping[field.key] = hit.raw;
      used.add(hit.raw);
    }
  }

  // Pass 2 — substring either direction, for fields still unmatched.
  for (const field of IMPORT_FIELDS) {
    if (mapping[field.key]) continue;
    const cands = candidatesFor(field);
    const hit = norm.find(
      (h) =>
        !used.has(h.raw) &&
        cands.some((c) => c.length >= 3 && (h.n.includes(c) || c.includes(h.n))),
    );
    if (hit) {
      mapping[field.key] = hit.raw;
      used.add(hit.raw);
    }
  }

  return mapping;
}
