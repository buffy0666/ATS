import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getResolvedAIConfig } from "@/lib/ai";
import { PROVIDERS } from "@/lib/ai/catalog";
import { AIConfigForm } from "./AIConfigForm";
import { CredentialGuide } from "./CredentialGuide";
import { getCurrentKeyPreview } from "./actions";

export const dynamic = "force-dynamic";

export default async function AISettingsPage() {
  const { orgId } = await requireAdminWithOrg();

  // Read raw DB row so we can show "is this from DB or env?" honestly.
  // AIConfig is keyed per-organization, and the resolver must be scoped to
  // the same org — otherwise the banner always reports the env fallback even
  // after a successful save.
  const [dbRow, resolved, keyPreview] = await Promise.all([
    prisma.aIConfig.findUnique({ where: { organizationId: orgId } }),
    getResolvedAIConfig(orgId),
    getCurrentKeyPreview(),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">AI provider</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Powers the resume parser and the in-app assistant. Settings here override
          environment variables and take effect immediately on save.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 text-sm">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <span className="text-xs uppercase tracking-wide text-zinc-500">Active</span>{" "}
            <span className="font-medium">{PROVIDERS[resolved.provider].label}</span>{" "}
            <span className="text-zinc-500">/ {resolved.model || "(no model)"}</span>
          </div>
          <div className="text-xs text-zinc-500">
            Loaded from{" "}
            <span className="font-medium">{resolved.source === "db" ? "database" : "environment variables"}</span>.
          </div>
        </div>
      </div>

      <CredentialGuide />

      <AIConfigForm
        initial={{
          provider: dbRow?.provider ?? resolved.provider,
          model: dbRow?.model ?? resolved.model,
          baseUrl: dbRow?.baseUrl ?? resolved.baseUrl,
          timeoutMs: dbRow?.timeoutMs ?? null,
          hasKey: Boolean(dbRow?.apiKeyEncrypted),
          keyPreview,
          authMode: dbRow?.authMode === "oauth" ? "oauth" : "apiKey",
          hasRefreshToken: Boolean(dbRow?.oauthRefreshTokenEncrypted),
          oauthClientId: dbRow?.oauthClientId ?? null,
        }}
      />
    </div>
  );
}
