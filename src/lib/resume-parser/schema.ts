import { z } from "zod";

export const WorkHistoryItemSchema = z
  .object({
    company: z.string().min(1).max(160).describe("Employer or organization name."),
    title: z.string().min(1).max(160).describe("Role title held by the candidate."),
    startDate: z
      .string()
      .max(20)
      .optional()
      .describe("Start date as YYYY-MM or YYYY when available."),
    endDate: z
      .string()
      .max(20)
      .optional()
      .describe('End date as YYYY-MM, YYYY, or "Present".'),
    summary: z.string().max(1000).optional().describe("Brief summary of responsibilities or impact."),
  })
  .describe("One role from the candidate's work history.");

export const EducationItemSchema = z
  .object({
    school: z.string().min(1).max(180).describe("School, university, or training provider."),
    degree: z.string().max(160).optional(),
    field: z.string().max(160).optional(),
    startDate: z.string().max(20).optional().describe("Start date as YYYY-MM or YYYY when available."),
    endDate: z.string().max(20).optional().describe("End date as YYYY-MM or YYYY when available."),
  })
  .describe("One education credential from the resume.");

export const ParsedResumeSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(3).max(40).optional(),
  linkedinUrl: z.string().url().max(300).optional(),
  githubUrl: z.string().url().max(300).optional().describe("GitHub profile URL if linked or mentioned."),
  portfolioUrl: z
    .string()
    .url()
    .max(300)
    .optional()
    .describe("Personal website, portfolio, or other primary professional URL (not LinkedIn or GitHub)."),
  locationCity: z.string().max(120).optional().describe("Current city of residence if stated."),
  locationState: z.string().max(120).optional().describe("Current state, province, or region if stated."),
  locationCountry: z.string().max(120).optional().describe("Current country if stated."),
  currentTitle: z
    .string()
    .max(160)
    .optional()
    .describe("Most recent job title (from the latest role in work history)."),
  currentCompany: z
    .string()
    .max(160)
    .optional()
    .describe("Most recent employer (from the latest role in work history)."),
  yearsExperience: z
    .number()
    .int()
    .min(0)
    .max(80)
    .optional()
    .describe("Total years of professional experience, rounded to a whole number. Omit if not derivable."),
  summary: z
    .string()
    .max(1000)
    .optional()
    .describe("A 1-3 sentence recruiter-facing elevator pitch for the candidate."),
  skills: z.array(z.string().min(1).max(80)).default([]),
  workHistory: z.array(WorkHistoryItemSchema).default([]),
  education: z.array(EducationItemSchema).default([]),
});

export type WorkHistoryItem = z.infer<typeof WorkHistoryItemSchema>;
export type EducationItem = z.infer<typeof EducationItemSchema>;
export type ParsedResume = z.infer<typeof ParsedResumeSchema>;
