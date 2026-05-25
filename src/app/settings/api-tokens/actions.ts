"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { createApiToken, revokeApiToken } from "@/lib/api-tokens";

const nameSchema = z.string().trim().min(1).max(80);

export type CreateTokenResult =
  | { ok: true; token: string; id: string; tokenPrefix: string; name: string }
  | { ok: false; error: string };

export async function createTokenAction(
  _prev: CreateTokenResult | undefined,
  formData: FormData,
): Promise<CreateTokenResult> {
  const { session, orgId } = await requireSessionWithOrg();
  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { ok: false, error: "Name is required (1-80 characters)." };
  }
  const { token, record } = await createApiToken(session.user.id, parsed.data, orgId);
  revalidatePath("/settings/api-tokens");
  return { ok: true, token, id: record.id, tokenPrefix: record.tokenPrefix, name: record.name };
}

export async function revokeTokenAction(tokenId: string): Promise<void> {
  const { session } = await requireSessionWithOrg();
  await revokeApiToken(session.user.id, tokenId);
  revalidatePath("/settings/api-tokens");
}
