import type { AICompletionRequest, AICompletionResponse, AIProvider } from "./provider";
import { AIProviderError } from "./provider";
import { z } from "zod";

const chatCompletionResponseSchema = z
  .object({
    model: z.string().optional(),
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.union([z.string(), z.array(z.unknown())]).nullable().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
    usage: z
      .object({
        prompt_tokens: z.number().optional(),
        completion_tokens: z.number().optional(),
        total_tokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type OpenAICompatibleOptions = {
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
};

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.providerName;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
  }

  async complete(input: AICompletionRequest): Promise<AICompletionResponse> {
    const timeout = input.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: input.model ?? this.model,
          messages: [
            ...(input.system ? [{ role: "system", content: input.system }] : []),
            { role: "user", content: input.prompt },
          ],
          max_tokens: input.maxTokens,
          temperature: input.temperature ?? 0,
          ...(input.responseFormat === "json"
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
      });

      const body = await readResponseBody(response);
      if (!response.ok) {
        throw new AIProviderError(
          this.name,
          `Completion request failed with HTTP ${response.status}: ${extractErrorMessage(body)}`,
          body,
        );
      }

      const parsed = chatCompletionResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new AIProviderError(this.name, "Provider returned an unexpected response shape.", body);
      }

      const content = parsed.data.choices[0]?.message.content;
      const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
      if (!text.trim()) {
        throw new AIProviderError(this.name, "Provider returned an empty completion.");
      }

      return {
        text,
        provider: this.name,
        model: parsed.data.model ?? input.model ?? this.model,
        usage: parsed.data.usage
          ? {
              inputTokens: parsed.data.usage.prompt_tokens,
              outputTokens: parsed.data.usage.completion_tokens,
              totalTokens: parsed.data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AIProviderError(this.name, `Completion timed out after ${timeout}ms.`, error);
      }
      throw new AIProviderError(this.name, "Completion request failed.", error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, baseUrl: string, model: string, timeoutMs: number) {
    if (!apiKey) {
      throw new Error("AI_API_KEY is required when AI_PROVIDER=openai");
    }
    super({
      providerName: "openai",
      baseUrl,
      model,
      apiKey,
      timeoutMs,
    });
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 500);
  if (body && typeof body === "object") {
    const error = "error" in body ? body.error : undefined;
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
    if ("message" in body) return String(body.message);
  }
  return "Unknown provider error";
}
