import "server-only";

import { completeJson } from "@/lib/ai";
import { buildResumeParsePrompt, RESUME_PARSE_SYSTEM_PROMPT } from "./prompts";
import { extractResumeText } from "./extract";
import { ParsedResumeSchema, type ParsedResume } from "./schema";

const MAX_RESUME_TEXT_CHARS = 40000;
const PARSER_VERSION = "resume-parser-v1";

export async function parseResume(file: File | { url: string }): Promise<ParsedResume> {
  const resumeText = await extractResumeText(file);
  if (resumeText.length < 40) {
    throw new Error("Could not extract enough text from this resume to parse it.");
  }

  const result = await completeJson({
    system: RESUME_PARSE_SYSTEM_PROMPT,
    prompt: buildResumeParsePrompt(resumeText.slice(0, MAX_RESUME_TEXT_CHARS)),
    schema: ParsedResumeSchema,
    maxTokens: 4000,
  });

  return result.data;
}

/**
 * Cosmetic stamp written to Candidate.parserVersion. Reads from env vars only;
 * the actual provider used at parse time is resolved from the DB-backed
 * AIConfig via getResolvedAIConfig(). The mismatch is acceptable because this
 * stamp is just for audit logs; the real provider/model are visible in
 * Settings → AI provider.
 */
export function getResumeParserVersion(): string {
  const provider = (process.env.AI_PROVIDER ?? "ollama").toLowerCase();
  const model = process.env.AI_MODEL ?? (provider === "ollama" ? "gemma3:27b" : "unknown-model");
  return `${PARSER_VERSION}:${provider}:${model}`;
}

export type { ParsedResume, WorkHistoryItem, EducationItem } from "./schema";
export { ParsedResumeSchema, WorkHistoryItemSchema, EducationItemSchema } from "./schema";
