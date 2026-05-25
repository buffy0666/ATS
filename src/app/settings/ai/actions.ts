"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskKey } from "@/lib/crypto";
import { complete, invalidateAIProviderCache } from "@/lib/ai";
import { isProviderId, ollamaNativeRoot, PROVIDERS } from "@/lib/ai/catalog";
import { KEY_UNCHANGED } from "./constants";

const saveSchema = z.object({
  provider: z.string().refine(isProviderId, "Unknown provider."),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().url().max(300).optional().or(z.literal("").transform(() => undefined)),
  apiKey: z.string().max(500).optional(), // KEY_UNCHANGED sentinel handled below
  timeoutMs: z
    .union([z.literal(""), z.coerce.number().int().min(1000).max(600000)])
    .optional()
    .transform((v) => (typeof v === "number" ? v : undefined)),
});

export type SaveAIConfigResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * AIConfig is per-organization (unique on organizationId). Each tenant
 * brings their own provider + key in Settings → AI provider.
 */
export async function saveAIConfig(formData: FormData): Promise<SaveAIConfigResult> {
  const { orgId } = await requireAdminWithOrg();

  const parsed = saveSchema.safeParse({
    provider: formData.get("provider"),
    model: formData.get("model"),
    baseUrl: formData.get("baseUrl") ?? "",
    apiKey: formData.get("apiKey") ?? "",
    timeoutMs: formData.get("timeoutMs") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const data = parsed.data;
  const meta = PROVIDERS[data.provider];

  let apiKeyEncrypted: string | null | undefined;
  if (data.apiKey === KEY_UNCHANGED || data.apiKey === undefined) {
    apiKeyEncrypted = undefined;
  } else if (data.apiKey === "") {
    if (meta.requiresApiKey) {
      return { ok: false, error: `${meta.label} requires an API key.` };
    }
    apiKeyEncrypted = null;
  } else {
    apiKeyEncrypted = encryptSecret(data.apiKey);
  }

  if (meta.requiresApiKey && apiKeyEncrypted === null) {
    return { ok: false, error: `${meta.label} requires an API key.` };
  }

  if (meta.requiresApiKey && apiKeyEncrypted === undefined) {
    const existing = await prisma.aIConfig.findUnique({
      where: { organizationId: orgId },
      select: { apiKeyEncrypted: true },
    });
    if (!existing?.apiKeyEncrypted) {
      return { ok: false, error: `Enter an API key for ${meta.label} before saving.` };
    }
  }

  // Upsert by organizationId — each org has at most one AIConfig row.
  await prisma.aIConfig.upsert({
    where: { organizationId: orgId },
    update: {
      provider: data.provider,
      model: data.model,
      baseUrl: data.baseUrl ?? null,
      ...(apiKeyEncrypted !== undefined ? { apiKeyEncrypted } : {}),
      timeoutMs: data.timeoutMs ?? null,
    },
    create: {
      organizationId: orgId,
      provider: data.provider,
      model: data.model,
      baseUrl: data.baseUrl ?? null,
      apiKeyEncrypted: apiKeyEncrypted ?? null,
      timeoutMs: data.timeoutMs ?? null,
    },
  });

  invalidateAIProviderCache(orgId);
  revalidatePath("/settings/ai");
  return { ok: true };
}

export type TestAIConfigResult =
  | { ok: true; provider: string; model: string; sample: string }
  | { ok: false; error: string };

export async function testAIConfig(): Promise<TestAIConfigResult> {
  const { orgId } = await requireAdminWithOrg();

  try {
    const response = await complete(
      {
        prompt: "Reply with the single word OK and nothing else.",
        maxTokens: 16,
        temperature: 0,
        timeoutMs: 30000,
      },
      orgId,
    );
    return {
      ok: true,
      provider: response.provider,
      model: response.model ?? "(unspecified)",
      sample: response.text.slice(0, 200).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error during AI test.",
    };
  }
}

const ollamaTagsSchema = z.object({
  models: z
    .array(
      z
        .object({
          name: z.string(),
          model: z.string().optional(),
          size: z.number().optional(),
          modified_at: z.string().optional(),
        })
        .passthrough(),
    )
    .optional(),
});

export type ListOllamaModelsResult =
  | { ok: true; models: { name: string; size?: number }[] }
  | { ok: false; error: string };

export async function listOllamaModels(baseUrl: string): Promise<ListOllamaModelsResult> {
  await requireAdminWithOrg();

  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter the Ollama base URL first." };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: "Base URL must start with http:// or https://" };
  }

  const root = ollamaNativeRoot(trimmed);
  const url = `${root}/api/tags`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      return { ok: false, error: `Ollama responded with HTTP ${response.status} at ${url}.` };
    }
    const json = await response.json();
    const parsed = ollamaTagsSchema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, error: "Unexpected response shape from Ollama /api/tags." };
    }
    const models = (parsed.data.models ?? []).map((m) => ({ name: m.name, size: m.size }));
    return { ok: true, models };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, error: `Timed out connecting to ${url}.` };
    }
    return {
      ok: false,
      error: `Could not reach Ollama at ${url}: ${error instanceof Error ? error.message : "unknown"}.`,
    };
  }
}

export async function getCurrentKeyPreview(): Promise<string | null> {
  const { orgId } = await requireAdminWithOrg();
  const row = await prisma.aIConfig.findUnique({
    where: { organizationId: orgId },
    select: { apiKeyEncrypted: true },
  });
  if (!row?.apiKeyEncrypted) return null;
  try {
    return maskKey(decryptSecret(row.apiKeyEncrypted));
  } catch {
    return "(undecryptable — re-save the key)";
  }
}
