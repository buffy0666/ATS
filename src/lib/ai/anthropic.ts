import Anthropic from "@anthropic-ai/sdk";
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

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    apiKey: string,
    model: string,
    timeoutMs: number,
    baseUrl?: string,
    authMode: "apiKey" | "oauth" = "apiKey",
  ) {
    if (!apiKey) {
      throw new Error("AI_API_KEY is required when AI_PROVIDER=anthropic");
    }
    // In "oauth" mode the stored secret is a Bearer access token (e.g. from a
    // Claude Pro/Max login) rather than an sk-ant API key. The SDK sends it via
    // `authToken` as `Authorization: Bearer …`, and the OAuth beta header is
    // required for the Messages API to accept it. In "apiKey" mode we use the
    // normal x-api-key path.
    this.client =
      authMode === "oauth"
        ? new Anthropic({
            authToken: apiKey,
            baseURL: baseUrl,
            defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
          })
        : new Anthropic({
            apiKey,
            baseURL: baseUrl,
          });
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async complete(input: AICompletionRequest): Promise<AICompletionResponse> {
    try {
      const response = await this.client.messages.create(
        {
          model: input.model ?? this.model,
          max_tokens: input.maxTokens ?? 4000,
          temperature: input.temperature ?? 0,
          system: input.system,
          messages: [{ role: "user", content: input.prompt }],
        },
        { timeout: input.timeoutMs ?? this.timeoutMs },
      );

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (!text) {
        throw new AIProviderError(this.name, "Provider returned an empty completion.", response);
      }

      return {
        text,
        provider: this.name,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError(this.name, "Completion request failed.", error);
    }
  }

  async *chat(input: ChatInput): AsyncIterable<ChatChunk> {
    const { system, messages } = splitAnthropicMessages(input.messages);
    const tools = input.tools ? toAnthropicTools(input.tools) : undefined;

    type ToolBuilder = { id: string; name: string; argsText: string };
    const toolBuilders = new Map<number, ToolBuilder>();
    let finishReason: "stop" | "tool_calls" | "length" | "error" = "stop";

    try {
      // SDK's MessageStreamParams is finely typed (per-block kinds, etc.);
      // we've already validated the shape upstream so the cast is safe.
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: input.maxTokens ?? 4096,
        temperature: input.temperature ?? 0.2,
        ...(system ? { system } : {}),
        messages,
        ...(tools ? { tools } : {}),
      } as unknown as Parameters<typeof this.client.messages.stream>[0]);

      for await (const event of stream) {
        // The SDK's event union is large; we only care about a few shapes.
        const ev = event as unknown as {
          type: string;
          index?: number;
          content_block?: {
            type: string;
            id?: string;
            name?: string;
          };
          delta?: {
            type?: string;
            text?: string;
            partial_json?: string;
            stop_reason?: string;
          };
        };
        switch (ev.type) {
          case "content_block_start": {
            const idx = ev.index ?? 0;
            if (ev.content_block?.type === "tool_use") {
              toolBuilders.set(idx, {
                id: ev.content_block.id ?? "",
                name: ev.content_block.name ?? "",
                argsText: "",
              });
            }
            break;
          }
          case "content_block_delta": {
            if (ev.delta?.type === "text_delta" && ev.delta.text) {
              yield { type: "text", delta: ev.delta.text };
            } else if (ev.delta?.type === "input_json_delta" && ev.delta.partial_json) {
              const idx = ev.index ?? 0;
              const builder = toolBuilders.get(idx);
              if (builder) builder.argsText += ev.delta.partial_json;
            }
            break;
          }
          case "message_delta": {
            const stopReason = ev.delta?.stop_reason;
            if (stopReason === "tool_use") finishReason = "tool_calls";
            else if (stopReason === "max_tokens") finishReason = "length";
            else if (stopReason === "end_turn" || stopReason === "stop_sequence") {
              finishReason = "stop";
            }
            break;
          }
          default:
            // message_start / content_block_stop / message_stop — nothing to do.
            break;
        }
      }
    } catch (error) {
      if (error instanceof AIProviderError) throw error;
      throw new AIProviderError(this.name, "Chat stream failed.", error);
    }

    if (toolBuilders.size > 0) {
      const ordered = [...toolBuilders.entries()].sort(([a], [b]) => a - b);
      for (const [, builder] of ordered) {
        const toolCall = parseAnthropicToolBuilder(builder);
        if (toolCall) yield { type: "tool_call", toolCall };
      }
      if (finishReason === "stop") finishReason = "tool_calls";
    }

    yield { type: "done", finishReason };
  }
}

// ---------- helpers ----------

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

function splitAnthropicMessages(messages: ChatMessage[]): {
  system: string | undefined;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const out: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }

    let next: AnthropicMessage;
    if (m.role === "user") {
      next = { role: "user", content: m.content };
    } else if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content && m.content.trim()) {
        blocks.push({ type: "text", text: m.content });
      }
      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments ?? {} });
        }
      }
      next =
        blocks.length === 1 && blocks[0].type === "text"
          ? { role: "assistant", content: blocks[0].text }
          : { role: "assistant", content: blocks };
    } else {
      // Tool result — Anthropic delivers these as user messages with
      // a tool_result content block. Merge adjacent ones into a single
      // user message so the API doesn't reject duplicates.
      const block: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content,
      };
      if (out.length > 0 && out[out.length - 1].role === "user") {
        const prev = out[out.length - 1];
        const prevContent = Array.isArray(prev.content)
          ? prev.content
          : [{ type: "text", text: prev.content } satisfies AnthropicContentBlock];
        prev.content = [...prevContent, block];
        continue;
      }
      next = { role: "user", content: [block] };
    }

    // Coalesce same-role-in-a-row to satisfy Anthropic's alternation rule.
    if (out.length > 0 && out[out.length - 1].role === next.role) {
      const prev = out[out.length - 1];
      const prevBlocks = toBlockArray(prev.content);
      const nextBlocks = toBlockArray(next.content);
      prev.content = [...prevBlocks, ...nextBlocks];
      continue;
    }
    out.push(next);
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: out,
  };
}

function toBlockArray(
  content: string | AnthropicContentBlock[],
): AnthropicContentBlock[] {
  if (Array.isArray(content)) return content;
  return [{ type: "text", text: content }];
}

function toAnthropicTools(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

function parseAnthropicToolBuilder(builder: {
  id: string;
  name: string;
  argsText: string;
}): ToolCall | null {
  if (!builder.name || !builder.id) return null;
  let args: Record<string, unknown> = {};
  if (builder.argsText.trim()) {
    try {
      const parsed = JSON.parse(builder.argsText);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>;
      }
    } catch {
      // Leave empty; orchestrator surfaces the parse failure.
    }
  }
  return { id: builder.id, name: builder.name, arguments: args };
}
