import { OpenAICompatibleProvider } from "./openai";

export class OllamaProvider extends OpenAICompatibleProvider {
  constructor(baseUrl: string, model: string, timeoutMs: number, apiKey?: string) {
    super({
      providerName: "ollama",
      baseUrl,
      model,
      apiKey,
      timeoutMs,
    });
  }
}
