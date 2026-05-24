"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PROVIDERS, type ProviderId } from "@/lib/ai/catalog";
import {
  listOllamaModels,
  saveAIConfig,
  testAIConfig,
  type ListOllamaModelsResult,
  type SaveAIConfigResult,
  type TestAIConfigResult,
} from "./actions";
import { KEY_UNCHANGED } from "./constants";

type Initial = {
  provider: string;
  model: string;
  baseUrl: string | null;
  timeoutMs: number | null;
  hasKey: boolean;
  keyPreview: string | null;
};

const PROVIDER_OPTIONS: ProviderId[] = ["ollama", "openai", "anthropic", "grok"];

function isProvider(value: string): value is ProviderId {
  return (PROVIDER_OPTIONS as string[]).includes(value);
}

export function AIConfigForm({ initial }: { initial: Initial }) {
  const initialProvider: ProviderId = isProvider(initial.provider) ? initial.provider : "ollama";

  const [provider, setProvider] = useState<ProviderId>(initialProvider);
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl ?? "");
  const [timeoutMs, setTimeoutMs] = useState<string>(initial.timeoutMs ? String(initial.timeoutMs) : "");

  // Key handling: when the form loads, if a key is already stored we show
  // a "keep current key" placeholder. Typing anything replaces it.
  const [keyValue, setKeyValue] = useState("");
  const [keyDirty, setKeyDirty] = useState(false);

  // Ollama-model discovery state
  const [ollamaModels, setOllamaModels] = useState<{ name: string; size?: number }[] | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  const [fetchingOllama, setFetchingOllama] = useState(false);

  // Save / test state
  const [saveResult, setSaveResult] = useState<SaveAIConfigResult | null>(null);
  const [testResult, setTestResult] = useState<TestAIConfigResult | null>(null);
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();

  const meta = PROVIDERS[provider];

  // When the user switches providers, reset model + baseUrl to that
  // provider's defaults if they were previously empty or matched a different
  // provider's default. Keeps the form predictable.
  const lastProviderRef = useRef<ProviderId>(initialProvider);
  useEffect(() => {
    if (lastProviderRef.current === provider) return;
    const prevDefault = PROVIDERS[lastProviderRef.current].defaultBaseUrl;
    if (!baseUrl || baseUrl === prevDefault) {
      setBaseUrl(PROVIDERS[provider].defaultBaseUrl);
    }
    // Reset model unless the user has been actively typing (we keep their
    // value if it matches one in the new provider's curated list)
    const newList = PROVIDERS[provider].models;
    if (newList.length > 0 && !newList.includes(model)) {
      setModel(newList[0]);
    } else if (newList.length === 0 && model && PROVIDERS[lastProviderRef.current].models.includes(model)) {
      setModel("");
    }
    setOllamaModels(null);
    setOllamaError(null);
    lastProviderRef.current = provider;
  }, [provider, baseUrl, model]);

  async function fetchOllama() {
    setFetchingOllama(true);
    setOllamaError(null);
    try {
      const result: ListOllamaModelsResult = await listOllamaModels(
        baseUrl || meta.defaultBaseUrl,
      );
      if (result.ok) {
        setOllamaModels(result.models);
        // Auto-select first model if current value is empty or not in the list.
        if (result.models.length > 0 && !result.models.some((m) => m.name === model)) {
          setModel(result.models[0].name);
        }
      } else {
        setOllamaModels(null);
        setOllamaError(result.error);
      }
    } finally {
      setFetchingOllama(false);
    }
  }

  function onSubmit(formData: FormData) {
    // If user didn't touch the key field and a key already exists in the DB,
    // send a sentinel so the server keeps the existing one.
    if (!keyDirty && initial.hasKey) {
      formData.set("apiKey", KEY_UNCHANGED);
    } else {
      formData.set("apiKey", keyValue);
    }
    startSaving(async () => {
      const result = await saveAIConfig(formData);
      setSaveResult(result);
      setTestResult(null);
      if (result.ok) {
        setKeyDirty(false);
        setKeyValue("");
      }
    });
  }

  function onTest() {
    setTestResult(null);
    startTesting(async () => {
      const result = await testAIConfig();
      setTestResult(result);
    });
  }

  const curatedModels = useMemo(() => meta.models, [meta]);

  return (
    <form action={onSubmit} className="space-y-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Provider */}
        <div>
          <label htmlFor="provider" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
            Provider
          </label>
          <select
            id="provider"
            name="provider"
            value={provider}
            onChange={(e) => isProvider(e.target.value) && setProvider(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PROVIDERS[p].label}
              </option>
            ))}
          </select>
        </div>

        {/* Model */}
        <div>
          <label htmlFor="model" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
            Model
          </label>

          {provider === "ollama" ? (
            <ModelComboField
              name="model"
              value={model}
              onChange={setModel}
              options={ollamaModels?.map((m) => m.name) ?? []}
              placeholder="e.g. gemma3:27b"
              extraButton={
                <button
                  type="button"
                  onClick={fetchOllama}
                  disabled={fetchingOllama}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  {fetchingOllama ? "Fetching…" : ollamaModels ? "Refresh" : "Fetch installed models"}
                </button>
              }
            />
          ) : (
            <ModelComboField
              name="model"
              value={model}
              onChange={setModel}
              options={curatedModels}
              placeholder="Pick a model or type a custom ID"
            />
          )}

          {provider === "ollama" && ollamaError && (
            <p className="mt-1 text-xs text-red-600">{ollamaError}</p>
          )}
        </div>

        {/* Base URL */}
        <div>
          <label htmlFor="baseUrl" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
            Base URL
          </label>
          <input
            id="baseUrl"
            name="baseUrl"
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={meta.defaultBaseUrl}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Defaults to <span className="font-mono">{meta.defaultBaseUrl}</span>
          </p>
        </div>

        {/* Timeout */}
        <div>
          <label htmlFor="timeoutMs" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
            Timeout (ms)
          </label>
          <input
            id="timeoutMs"
            name="timeoutMs"
            type="number"
            min={1000}
            max={600000}
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
            placeholder="60000"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>

        {/* API key */}
        <div className="md:col-span-2">
          <label htmlFor="apiKey" className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
            API key {meta.requiresApiKey ? <span className="text-red-500">*</span> : <span className="text-zinc-400">(optional)</span>}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyDirty ? keyValue : ""}
              onChange={(e) => {
                setKeyValue(e.target.value);
                setKeyDirty(true);
              }}
              placeholder={
                initial.hasKey && !keyDirty
                  ? `Stored: ${initial.keyPreview ?? "•••• ••••"} (leave blank to keep)`
                  : meta.requiresApiKey
                    ? "Paste your API key"
                    : "Not required for Ollama"
              }
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
            />
            {initial.hasKey && keyDirty && (
              <button
                type="button"
                onClick={() => {
                  setKeyDirty(false);
                  setKeyValue("");
                }}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Cancel change
              </button>
            )}
          </div>
          {meta.keyUrl && (
            <p className="mt-1 text-xs text-zinc-500">
              Get one at{" "}
              <a href={meta.keyUrl} target="_blank" rel="noreferrer" className="underline">
                {new URL(meta.keyUrl).host}
              </a>
              . Keys are stored AES-256-GCM encrypted at rest.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>

        {saveResult && (
          <span
            className={`ml-auto text-sm ${
              saveResult.ok ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {saveResult.ok ? "Saved." : saveResult.error}
          </span>
        )}
      </div>

      {testResult && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            testResult.ok
              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
              : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 text-red-900 dark:text-red-200"
          }`}
        >
          {testResult.ok ? (
            <>
              <div className="font-medium">✓ Connected to {testResult.provider}</div>
              <div className="text-xs mt-1">
                Model: <span className="font-mono">{testResult.model}</span> — reply:{" "}
                <span className="font-mono">{testResult.sample || "(empty)"}</span>
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">✗ Test failed</div>
              <div className="text-xs mt-1">{testResult.error}</div>
            </>
          )}
        </div>
      )}
    </form>
  );
}

/**
 * Hybrid combo input: a text input plus a dropdown of suggestions. Lets the
 * admin pick a known model from the list OR paste a brand-new model ID.
 */
function ModelComboField({
  name,
  value,
  onChange,
  options,
  placeholder,
  extraButton,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  extraButton?: React.ReactNode;
}) {
  const listId = `${name}-options`;
  return (
    <div className="flex items-stretch gap-2">
      <input
        id={name}
        name={name}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
      />
      {options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {extraButton}
    </div>
  );
}
