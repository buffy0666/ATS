import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getResolvedAIConfig, PROVIDERS } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * Lightweight metadata about the AI provider/model the assistant is using
 * for the caller's org. Returned just so the chat UI can show "via <model>"
 * in its header. API key and baseUrl are deliberately omitted.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = session.user.organizationId ?? null;
  const cfg = await getResolvedAIConfig(orgId);
  return NextResponse.json({
    provider: cfg.provider,
    providerLabel: PROVIDERS[cfg.provider].label,
    model: cfg.model || null,
    // Drives the assistant's "dev mode": only platform owners (operator tier)
    // see raw tool args / JSON. Regular users get the clean rendered results.
    isPlatformAdmin: session.user.isPlatformAdmin ?? false,
  });
}
