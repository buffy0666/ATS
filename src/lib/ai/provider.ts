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

// ---------- Chat (streaming + tool calling) ----------
//
// A unified shape across providers so the orchestrator doesn't care whether
// the underlying API is OpenAI's `chat.completions`, Anthropic's `messages`,
// or Ollama's OpenAI-compatible endpoint.

export type ToolCall = {
  /** Provider-assigned id used to correlate tool_result messages later. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; content: string; toolCallId: string };

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema object describing the tool's arguments. */
  parameters: object;
};

export type ChatFinishReason = "stop" | "tool_calls" | "length" | "error";

export type ChatChunk =
  | { type: "text"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; finishReason: ChatFinishReason };

export type ChatInput = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
};

export interface AIProvider {
  readonly name: string;
  complete(input: AICompletionRequest): Promise<AICompletionResponse>;
  /**
   * Stream a chat turn. Yields text deltas as they arrive and any tool calls
   * the model decides to make. Always ends with a single `{ type: "done" }`
   * chunk carrying the finish reason.
   */
  chat(input: ChatInput): AsyncIterable<ChatChunk>;
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
