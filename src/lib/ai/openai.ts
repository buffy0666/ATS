import type {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
  ChatChunk,
  ChatInput,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from "./provider";
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

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const body = {
      model: this.model,
      stream: true,
      messages: toOpenAIMessages(input.messages),
      max_tokens: input.maxTokens,
      temperature: input.temperature ?? 0.2,
      ...(input.tools && input.tools.length > 0
        ? { tools: toOpenAITools(input.tools), tool_choice: "auto" }
        : {}),
    };

    // Streaming has no built-in timeout, so a slow/stalled model would hang
    // forever. Guard with an idle watchdog that fires only when no bytes
    // have arrived for IDLE_TIMEOUT_MS, plus a long total ceiling for
    // pathological streams. The idle timer MUST be bumped on every chunk —
    // otherwise reasoning models (e.g. grok-4) that emit `reasoning_content`
    // chunks for 30–90s before the final `content` get killed mid-stream
    // and the UI shows nothing.
    const controller = new AbortController();
    const TOTAL_TIMEOUT_MS = Math.max(this.timeoutMs * 5, 300_000);
    const IDLE_TIMEOUT_MS = Math.max(this.timeoutMs, 45_000);
    const totalTimeout = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const bumpIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
    };
    const clearTimers = () => {
      clearTimeout(totalTimeout);
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    let response: Response;
    try {
      bumpIdle();
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimers();
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AIProviderError(
          this.name,
          `Chat timed out with no response. The model may be overloaded or too slow — try a faster model.`,
          error,
        );
      }
      throw new AIProviderError(this.name, "Chat request failed to connect.", error);
    }

    if (!response.ok || !response.body) {
      clearTimers();
      const text = await safeText(response);
      throw new AIProviderError(
        this.name,
        `Chat request failed with HTTP ${response.status}: ${truncate(text, 500)}`,
      );
    }

    // Accumulate streaming tool_calls keyed by `index` — the OpenAI SSE
    // delivers tool args as JSON-string fragments that we concatenate.
    const toolBuilders = new Map<
      number,
      { id: string; name: string; argsText: string }
    >();
    let finishReason: "stop" | "tool_calls" | "length" | "error" = "stop";

    try {
    for await (const event of readOpenAISseEvents(response.body)) {
      // Any chunk — including reasoning-only chunks we don't render —
      // counts as activity and resets the idle watchdog.
      bumpIdle();
      if (event === "[DONE]") break;

      const choice = event?.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (typeof delta?.content === "string" && delta.content.length > 0) {
        yield { type: "text", delta: delta.content };
      }

      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const index = typeof tc.index === "number" ? tc.index : 0;
          let builder = toolBuilders.get(index);
          if (!builder) {
            builder = { id: "", name: "", argsText: "" };
            toolBuilders.set(index, builder);
          }
          if (typeof tc.id === "string" && tc.id.length > 0) builder.id = tc.id;
          if (typeof tc.function?.name === "string" && tc.function.name.length > 0) {
            builder.name = tc.function.name;
          }
          if (typeof tc.function?.arguments === "string") {
            builder.argsText += tc.function.arguments;
          }
        }
      }

      if (choice.finish_reason === "tool_calls") finishReason = "tool_calls";
      else if (choice.finish_reason === "length") finishReason = "length";
      else if (choice.finish_reason === "stop") finishReason = "stop";
    }

    if (toolBuilders.size > 0) {
      const ordered = [...toolBuilders.entries()].sort(([a], [b]) => a - b);
      for (const [, builder] of ordered) {
        const toolCall = buildToolCallFromBuilder(builder, this.name);
        if (toolCall) yield { type: "tool_call", toolCall };
      }
      // If the model emitted tool calls but the finish_reason never said so,
      // still treat it as a tool round to keep the orchestrator simple.
      if (finishReason === "stop") finishReason = "tool_calls";
    }

    yield { type: "done", finishReason };
    } finally {
      clearTimers();
    }
  }
}

// ---------- helpers ----------

function toOpenAIMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    switch (m.role) {
      case "system":
        return { role: "system", content: m.content };
      case "user":
        return { role: "user", content: m.content };
      case "assistant":
        if (m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: "assistant",
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments ?? {}),
              },
            })),
          };
        }
        return { role: "assistant", content: m.content };
      case "tool":
        return {
          role: "tool",
          tool_call_id: m.toolCallId,
          content: m.content,
        };
    }
  });
}

function toOpenAITools(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

const openAiStreamChunkSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            index: z.number().optional(),
            finish_reason: z.string().nullable().optional(),
            delta: z
              .object({
                role: z.string().optional(),
                content: z.string().nullable().optional(),
                tool_calls: z
                  .array(
                    z
                      .object({
                        index: z.number().optional(),
                        id: z.string().optional(),
                        type: z.string().optional(),
                        function: z
                          .object({
                            name: z.string().optional(),
                            arguments: z.string().optional(),
                          })
                          .partial()
                          .optional(),
                      })
                      .passthrough(),
                  )
                  .optional(),
              })
              .partial()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

type OpenAIStreamChunk = z.infer<typeof openAiStreamChunkSchema>;

async function* readOpenAISseEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<OpenAIStreamChunk | "[DONE]"> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = indexOfEventSeparator(buffer);
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + (buffer[separatorIndex] === "\r" ? 4 : 2));

        const dataLines = rawEvent
          .split("\n")
          .map((l) => l.replace(/\r$/, ""))
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) {
          separatorIndex = indexOfEventSeparator(buffer);
          continue;
        }
        const data = dataLines.join("\n");
        if (data === "[DONE]") {
          yield "[DONE]";
        } else {
          try {
            const parsed = openAiStreamChunkSchema.parse(JSON.parse(data));
            yield parsed;
          } catch {
            // Ignore malformed chunks rather than tear down the stream.
          }
        }
        separatorIndex = indexOfEventSeparator(buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function indexOfEventSeparator(buf: string): number {
  const lf = buf.indexOf("\n\n");
  const crlf = buf.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

function buildToolCallFromBuilder(
  builder: { id: string; name: string; argsText: string },
  providerName: string,
): ToolCall | null {
  if (!builder.name) return null;
  let args: Record<string, unknown> = {};
  if (builder.argsText.trim()) {
    try {
      const parsed = JSON.parse(builder.argsText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Leave args empty if the model produced un-parseable JSON. The
      // orchestrator will surface this as a tool execution error.
    }
  }
  return {
    id: builder.id || `${providerName}-${builder.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: builder.name,
    arguments: args,
  };
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "(unreadable body)";
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
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
