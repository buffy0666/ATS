import "server-only";

import { z } from "zod";
import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";
import { OpenAIProvider } from "./openai";
import {
  aiCompletionRequestSchema,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
  type ChatChunk,
  type ChatInput,
  AIProviderError,
} from "./provider";

let cached: AIProvider | null = null;

type CompleteJsonInput<TSchema extends z.ZodType> = AICompletionRequest & {
  schema: TSchema;
};

export type AIJsonCompletionResult<T> = AICompletionResponse & {
  data: T;
  raw: string;
};

function buildProvider(): AIProvider {
  const name = (process.env.AI_PROVIDER ?? "ollama").toLowerCase();
  const timeoutMs = parsePositiveInt(process.env.AI_TIMEOUT_MS, 60000);
  const apiKey = process.env.AI_API_KEY;

  switch (name) {
    case "ollama":
      return new OllamaProvider(
        process.env.AI_BASE_URL ?? "http://gx10.local:11434/v1",
        process.env.AI_MODEL ?? "gemma3:27b",
        timeoutMs,
        apiKey,
      );
    case "openai":
      return new OpenAIProvider(
        apiKey ?? "",
        process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
        getRequiredModel(name),
        timeoutMs,
      );
    case "anthropic":
      return new AnthropicProvider(
        apiKey ?? "",
        getRequiredModel(name),
        timeoutMs,
        process.env.AI_BASE_URL,
      );
    default:
      throw new Error(
        `Unknown AI_PROVIDER: '${name}'. Supported values: ollama, openai, anthropic.`,
      );
  }
}

function getProvider(): AIProvider {
  if (!cached) cached = buildProvider();
  return cached;
}

export async function complete(input: AICompletionRequest): Promise<AICompletionResponse> {
  const payload = aiCompletionRequestSchema.parse(input);
  return getProvider().complete(payload);
}

/**
 * Streaming chat — yields text deltas + tool calls one chunk at a time.
 * The orchestrator handles multi-turn tool loops; this is the bare provider
 * call for a single round.
 */
export function chat(input: ChatInput): AsyncIterable<ChatChunk> {
  return getProvider().chat(input);
}

export async function completeJson<TSchema extends z.ZodType>(
  input: CompleteJsonInput<TSchema>,
): Promise<AIJsonCompletionResult<z.infer<TSchema>>> {
  const schemaJson = JSON.stringify(z.toJSONSchema(input.schema), null, 2);
  const firstPrompt = withJsonInstructions(input.prompt, schemaJson);
  const first = await complete({
    ...input,
    prompt: firstPrompt,
    responseFormat: "json",
  });

  const firstParsed = parseAndValidateJson(input.schema, first.text);
  if (firstParsed.success) {
    return { ...first, data: firstParsed.data, raw: first.text };
  }

  const fix = await complete({
    ...input,
    prompt: [
      "The previous response did not parse as valid JSON for the requested schema.",
      "Return only corrected JSON. Do not include markdown fences, comments, or explanation.",
      "",
      "JSON schema:",
      schemaJson,
      "",
      "Original task:",
      input.prompt,
      "",
      "Invalid response:",
      first.text,
      "",
      "Validation error:",
      firstParsed.error,
    ].join("\n"),
    responseFormat: "json",
  });

  const fixedParsed = parseAndValidateJson(input.schema, fix.text);
  if (!fixedParsed.success) {
    throw new AIProviderError(
      fix.provider,
      `Model returned invalid JSON after retry: ${fixedParsed.error}`,
      {
        firstResponse: first.text,
        retryResponse: fix.text,
      },
    );
  }

  return { ...fix, data: fixedParsed.data, raw: fix.text };
}

export function getAIProviderName(): string {
  return getProvider().name;
}

export function _resetAIProviderForTests() {
  cached = null;
}

function withJsonInstructions(prompt: string, schemaJson: string): string {
  return [
    prompt,
    "",
    "Return only valid JSON that matches this JSON schema.",
    "Use null or omit optional fields when the resume does not contain the value.",
    "Do not include markdown fences, comments, or explanatory text.",
    "",
    "JSON schema:",
    schemaJson,
  ].join("\n");
}

function parseAndValidateJson<TSchema extends z.ZodType>(
  schema: TSchema,
  text: string,
):
  | { success: true; data: z.infer<TSchema> }
  | { success: false; error: string } {
  try {
    const json = parseJsonFromModelText(text);
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return { success: false, error: z.prettifyError(parsed.error) };
    }
    return { success: true, data: parsed.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid JSON response.",
    };
  }
}

function parseJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const objectStart = withoutFence.indexOf("{");
    const objectEnd = withoutFence.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(withoutFence.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = withoutFence.indexOf("[");
    const arrayEnd = withoutFence.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return JSON.parse(withoutFence.slice(arrayStart, arrayEnd + 1));
    }
  }

  throw new Error("Model response was not valid JSON.");
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequiredModel(provider: string): string {
  const model = process.env.AI_MODEL;
  if (!model) throw new Error(`AI_MODEL is required when AI_PROVIDER=${provider}`);
  return model;
}

export type {
  AICompletionRequest,
  AICompletionResponse,
  ChatChunk,
  ChatFinishReason,
  ChatInput,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from "./provider";
export { AIProviderError } from "./provider";
