/**
 * Provider/model catalog used by the AI settings UI.
 *
 * For non-Ollama providers we ship a curated list of models so the admin
 * doesn't have to memorize model IDs. The admin can still override with
 * `customModel` if a new model lands that we haven't catalogued.
 *
 * Ollama is omitted here — its models are discovered at runtime by querying
 * the user's Ollama server's /api/tags endpoint.
 */

export type ProviderId =
  | "ollama"
  | "openai"
  | "anthropic"
  | "grok"
  | "perplexity"
  | "google";

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  defaultBaseUrl: string;
  /** Does this provider require an API key? */
  requiresApiKey: boolean;
  /** Where the user can go to get a key — shown as a hint in the UI. */
  keyUrl?: string;
  /** Curated, ordered model list. Empty for Ollama (dynamic). */
  models: string[];
};

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  ollama: {
    id: "ollama",
    label: "Ollama (self-hosted)",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresApiKey: false,
    models: [], // discovered at runtime via /api/tags
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      "gpt-5.1",
      "gpt-5",
      "gpt-5-mini",
      "gpt-5-nano",
      "gpt-4.1",
    ],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultBaseUrl: "https://api.anthropic.com",
    requiresApiKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-haiku-4-5",
    ],
  },
  grok: {
    id: "grok",
    label: "xAI Grok",
    defaultBaseUrl: "https://api.x.ai/v1",
    requiresApiKey: true,
    keyUrl: "https://console.x.ai/team/default/api-keys",
    models: [
      "grok-4.3",
      "grok-4-latest",
      "grok-4",
    ],
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    // Perplexity exposes an OpenAI-compatible Chat Completions API.
    defaultBaseUrl: "https://api.perplexity.ai",
    requiresApiKey: true,
    keyUrl: "https://www.perplexity.ai/settings/api",
    models: [
      "sonar",
      "sonar-pro",
      "sonar-reasoning",
      "sonar-reasoning-pro",
      "sonar-deep-research",
    ],
  },
  google: {
    id: "google",
    label: "Google Gemini",
    // Gemini's OpenAI-compatibility layer — same Chat Completions surface.
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    requiresApiKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      "gemini-3-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ],
  },
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && value in PROVIDERS;
}

/**
 * Strip the OpenAI-compat `/v1` suffix from an Ollama base URL so we can
 * call native endpoints like `/api/tags`. Idempotent.
 */
export function ollamaNativeRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}
