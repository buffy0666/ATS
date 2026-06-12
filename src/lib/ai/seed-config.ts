import "server-only";

import type { Prisma } from "@/generated/prisma";

/**
 * Seed a new workspace's AIConfig from the "standard" template workspace
 * (T3X by default). This makes every new tenant inherit the same provider,
 * model, base URL, and timeout instead of silently falling back to env vars
 * until an OWNER configures it.
 *
 * Credentials are NOT copied — each workspace brings its own key. We seed the
 * non-secret settings only and leave apiKeyEncrypted null + authMode at its
 * "apiKey" default, so the OWNER just pastes their key in Settings → AI.
 *
 * The template workspace is resolved by slug via AI_TEMPLATE_ORG_SLUG
 * (default "t3x"). No-op if the template org or its AIConfig is absent, or if
 * the new org already has a config — so it's safe to call unconditionally.
 *
 * Runs inside the caller's transaction (pass the `tx` client) so the seeded
 * config commits atomically with the org/user creation.
 */
export async function seedAIConfigFromTemplate(
  tx: Prisma.TransactionClient,
  newOrgId: string,
): Promise<void> {
  const templateSlug = (process.env.AI_TEMPLATE_ORG_SLUG ?? "t3x").trim();
  if (!templateSlug) return;

  const template = await tx.organization.findUnique({
    where: { slug: templateSlug },
    select: { id: true, aiConfig: { select: { provider: true, model: true, baseUrl: true, timeoutMs: true } } },
  });

  const cfg = template?.aiConfig;
  // Nothing to clone, or the new org *is* the template.
  if (!cfg || template.id === newOrgId) return;

  const existing = await tx.aIConfig.findUnique({
    where: { organizationId: newOrgId },
    select: { id: true },
  });
  if (existing) return;

  await tx.aIConfig.create({
    data: {
      organizationId: newOrgId,
      provider: cfg.provider,
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      timeoutMs: cfg.timeoutMs,
      // No key copied — apiKeyEncrypted defaults null, authMode defaults "apiKey".
    },
  });
}
