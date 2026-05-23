import Anthropic from "@anthropic-ai/sdk";
import type { AICompletionRequest, AICompletionResponse, AIProvider } from "./provider";
import { AIProviderError } from "./provider";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(apiKey: string, model: string, timeoutMs: number, baseUrl?: string) {
    if (!apiKey) {
      throw new Error("AI_API_KEY is required when AI_PROVIDER=anthropic");
    }
    this.client = new Anthropic({
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
}
