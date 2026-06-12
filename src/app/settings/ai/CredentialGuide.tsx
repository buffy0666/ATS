import { PROVIDERS } from "@/lib/ai/catalog";

/**
 * Reference panel for the AI provider settings page: what value to paste into
 * the credential field for each provider, and where to get it. Server component
 * (static content) rendered above the AIConfigForm.
 *
 * Note on "OAuth/Auth": only Anthropic supports an OAuth Bearer token as an
 * alternative to an API key (select Credential type = OAuth token). OpenAI and
 * the others have no OAuth-for-API path, so "Auth" there means an API key.
 */

type Entry = {
  title: string;
  format: string;
  note: string;
  keyUrl?: string;
};

const ENTRIES: Entry[] = [
  {
    title: "Claude API key",
    format: "sk-ant-…",
    note: "Anthropic API key. Provider = Anthropic Claude, Credential type = API key.",
    keyUrl: PROVIDERS.anthropic.keyUrl,
  },
  {
    title: "Claude OAuth token",
    format: "Bearer access token",
    note:
      "Alternative to the API key for Claude: a Pro/Max OAuth/Bearer token. Provider = Anthropic Claude, Credential type = OAuth token. Sent as Authorization: Bearer with the OAuth beta header.",
  },
  {
    title: "OpenAI API key",
    format: "sk-…",
    note:
      "OpenAI uses API keys only — there is no OAuth path for API access, so \"OpenAI Auth\" means an API key. Provider = OpenAI.",
    keyUrl: PROVIDERS.openai.keyUrl,
  },
  {
    title: "Grok (xAI) key",
    format: "xai-…",
    note: "xAI API key. Provider = xAI Grok.",
    keyUrl: PROVIDERS.grok.keyUrl,
  },
  {
    title: "Perplexity / Google Gemini",
    format: "API key",
    note: "API keys only. Provider = Perplexity or Google Gemini.",
    keyUrl: PROVIDERS.perplexity.keyUrl,
  },
  {
    title: "Ollama (self-hosted)",
    format: "no key",
    note: "Runs against your own Ollama server — no credential required. Set the Base URL instead.",
  },
];

export function CredentialGuide() {
  return (
    <details className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-sm">
      <summary className="cursor-pointer font-medium select-none">
        What values do I enter? (Claude, OpenAI, Grok…)
      </summary>
      <p className="mt-2 text-xs text-zinc-500">
        Each workspace uses one active provider. Pick it below, then paste the matching
        credential. All secrets are stored AES-256-GCM encrypted at rest.
      </p>
      <dl className="mt-3 space-y-3">
        {ENTRIES.map((e) => (
          <div key={e.title} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-1">
            <dt className="font-medium">
              {e.title}{" "}
              <span className="font-mono text-xs text-zinc-500">({e.format})</span>
            </dt>
            <dd className="text-zinc-600 dark:text-zinc-400">
              {e.note}
              {e.keyUrl && (
                <>
                  {" "}
                  <a href={e.keyUrl} target="_blank" rel="noreferrer" className="underline">
                    Get one →
                  </a>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
