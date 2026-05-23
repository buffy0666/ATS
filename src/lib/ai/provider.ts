import { z } from "zod";

export const aiCompletionRequestSchema = z.object({
  system: z.string().optional(),
  prompt: z.string().min(1),
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  responseFormat: z.enum(["text", "json"]).default("text"),
  timeoutMs: z.number().int().positive().optional(),
  providerMeta: z.record(z.string(), z.unknown()).optional(),
});

export const aiCompletionResponseSchema = z.object({
  text: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  usage: z
    .object({
      inputTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    })
    .optional(),
});

export type AICompletionRequest = z.input<typeof aiCompletionRequestSchema>;
export type AICompletionResponse = z.infer<typeof aiCompletionResponseSchema>;

export interface AIProvider {
  readonly name: string;
  complete(input: AICompletionRequest): Promise<AICompletionResponse>;
}

export class AIProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "AIProviderError";
  }
}
