import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider, OpenAIProvider } from "./openai";
import { isProviderId, PROVIDERS, type ProviderId } from "./catalog";
import {
  aiCompletionRequestSchema,
  type AICompletionRequest,
  type AICompletionResponse,
  type AIProvider,
  type ChatChunk,
  type ChatInput,
  AIProviderError,
} from "./provider";

/**
 * AI provider resolution — per-organization in the multi-tenant era.
 *
 * Order of precedence:
 *  1. DB-backed AIConfig row scoped to the caller's org.
 *  2. Env vars (only used when no org is provided — legacy/dev fallback).
 *
 * The resolved provider is cached per-org for the lifetime of the
 * process. Admins invalidate after saving by passing their orgId.
 */

const providerCache = new Map<string, AIProvider>();
const ENV_CACHE_KEY = "__env__";

export function invalidateAIProviderCache(orgId?: string) {
  if (orgId) {
    providerCache.delete(orgId);
  } else {
    providerCache.clear();
  }
}

type CompleteJsonInput<TSchema extends z.ZodType> = AICompletionRequest & {
  schema: TSchema;
};

export type AIJsonCompletionResult<T> = AICompletionResponse & {
  data: T;
  raw: string;
};

export type ResolvedAIConfig = {
  source: "db" | "env";
  provider: ProviderId;
  model: string;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
};

async function loadConfig(orgId: string | null): Promise<ResolvedAIConfig> {
  const fromDb = orgId
    ? await prisma.aIConfig.findUnique({ where: { organizationId: orgId } }).catch(() => null)
    : null;
  const envProvider = (process.env.AI_PROVIDER ?? "").toLowerCase();
  const envTimeout = parsePositiveInt(process.env.AI_TIMEOUT_MS, 60000);

  if (fromDb && isProviderId(fromDb.provider)) {
    const meta = PROVIDERS[fromDb.provider];
    let apiKey: string | undefined;
    if (fromDb.apiKeyEncrypted) {
      try {
        apiKey = decryptSecret(fromDb.apiKeyEncrypted);
      } catch {
        // Failed decrypt typically means AUTH_SECRET rotated. We log nothing
        // here (server-only file); the test endpoint will surface the issue.
        apiKey = undefined;
      }
    }
    return {
      source: "db",
      provider: fromDb.provider,
      model: fromDb.model,
      baseUrl: fromDb.baseUrl ?? meta.defaultBaseUrl,
      apiKey,
      timeoutMs: fromDb.timeoutMs ?? envTimeout,
    };
  }

  // Fall back to env vars.
  const provider = isProviderId(envProvider) ? envProvider : ("ollama" as ProviderId);
  const meta = PROVIDERS[provider];
  return {
    source: "env",
    provider,
    model: process.env.AI_MODEL ?? (provider === "ollama" ? "gemma3:27b" : ""),
    baseUrl: process.env.AI_BASE_URL ?? meta.defaultBaseUrl,
    apiKey: process.env.AI_API_KEY,
    timeoutMs: envTimeout,
  };
}

export async function getResolvedAIConfig(orgId: string | null = null): Promise<ResolvedAIConfig> {
  return loadConfig(orgId);
}

function buildProvider(config: ResolvedAIConfig): AIProvider {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider(config.baseUrl, config.model, config.timeoutMs, config.apiKey);
    case "openai":
      return new OpenAIProvider(config.apiKey ?? "", config.baseUrl, requireModel(config), config.timeoutMs);
    case "anthropic":
      return new AnthropicProvider(
        config.apiKey ?? "",
        requireModel(config),
        config.timeoutMs,
        config.baseUrl,
      );
    case "grok":
      // xAI uses an OpenAI-compatible API surface.
      if (!config.apiKey) {
        throw new Error("AI_API_KEY is required for the Grok provider.");
      }
      return new OpenAICompatibleProvider({
        providerName: "grok",
        baseUrl: config.baseUrl,
        model: requireModel(config),
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
      });
  }
}

function requireModel(config: ResolvedAIConfig): string {
  if (!config.model) {
    throw new Error(`No AI model configured for provider '${config.provider}'.`);
  }
  return config.model;
}

async function getProvider(orgId: string | null): Promise<AIProvider> {
  const cacheKey = orgId ?? ENV_CACHE_KEY;
  const cached = providerCache.get(cacheKey);
  if (cached) return cached;
  const config = await loadConfig(orgId);
  const provider = buildProvider(config);
  providerCache.set(cacheKey, provider);
  return provider;
}

/**
 * Run a completion using the org's configured AI provider. orgId is
 * required for tenant isolation; omit (pass null) only from contexts that
 * legitimately have no org (e.g. env-var-driven dev runs of one-off
 * scripts).
 */
export async function complete(
  input: AICompletionRequest,
  orgId: string | null = null,
): Promise<AICompletionResponse> {
  const payload = aiCompletionRequestSchema.parse(input);
  const provider = await getProvider(orgId);
  return provider.complete(payload);
}

/**
 * Streaming chat — yields text deltas + tool calls one chunk at a time.
 * The orchestrator handles multi-turn tool loops; this is the bare provider
 * call for a single round.
 */
export async function* chat(
  input: ChatInput,
  orgId: string | null = null,
): AsyncIterable<ChatChunk> {
  const provider = await getProvider(orgId);
  yield* provider.chat(input);
}

export async function completeJson<TSchema extends z.ZodType>(
  input: CompleteJsonInput<TSchema>,
  orgId: string | null = null,
): Promise<AIJsonCompletionResult<z.infer<TSchema>>> {
  const schemaJson = JSON.stringify(z.toJSONSchema(input.schema), null, 2);
  const firstPrompt = withJsonInstructions(input.prompt, schemaJson);
  const first = await complete(
    {
      ...input,
      prompt: firstPrompt,
      responseFormat: "json",
    },
    orgId,
  );

  const firstParsed = parseAndValidateJson(input.schema, first.text);
  if (firstParsed.success) {
    return { ...first, data: firstParsed.data, raw: first.text };
  }

  const fix = await complete(
    {
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
    },
    orgId,
  );

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

export async function getAIProviderName(orgId: string | null = null): Promise<string> {
  return (await getProvider(orgId)).name;
}

export function _resetAIProviderForTests() {
  providerCache.clear();
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
export { PROVIDERS, type ProviderId } from "./catalog";
