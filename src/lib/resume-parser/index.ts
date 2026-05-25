import "server-only";

import { completeJson } from "@/lib/ai";
import { buildResumeParsePrompt, RESUME_PARSE_SYSTEM_PROMPT } from "./prompts";
import { extractResumeText } from "./extract";
import { ParsedResumeSchema, type ParsedResume } from "./schema";

const MAX_RESUME_TEXT_CHARS = 40000;
const PARSER_VERSION = "resume-parser-v1";

export async function parseResume(file: File | { url: string }): Promise<ParsedResume> {
  const resumeText = await extractResumeText(file);
  return parseResumeFromText(resumeText);
}

/**
 * Same AI parse, but starting from already-extracted text. Used by the
 * Chrome extension flow where the content script has already grabbed the
 * full visible text of the LinkedIn profile — no PDF to OCR.
 */
export async function parseResumeFromText(rawText: string): Promise<ParsedResume> {
  if (rawText.length < 40) {
    throw new Error("Not enough text to parse.");
  }

  const result = await completeJson({
    system: RESUME_PARSE_SYSTEM_PROMPT,
    prompt: buildResumeParsePrompt(rawText.slice(0, MAX_RESUME_TEXT_CHARS)),
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

export type {
  ActivityItem,
  EducationItem,
  ParsedResume,
  WorkHistoryItem,
} from "./schema";
export {
  ActivityItemSchema,
  EducationItemSchema,
  ParsedResumeSchema,
  WorkHistoryItemSchema,
} from "./schema";
