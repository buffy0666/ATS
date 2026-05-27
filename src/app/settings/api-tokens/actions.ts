"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { Role } from "@/generated/prisma";
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
  const { session, orgId } = await requireSessionWithOrg();
  if (session.user.role === Role.ADMIN) {
    // Admins can revoke any token in their own org — but never across
    // tenants: the org filter is the hard boundary.
    await prisma.apiToken.updateMany({
      where: { id: tokenId, organizationId: orgId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else {
    // Non-admins can only revoke tokens they created.
    await revokeApiToken(session.user.id, tokenId);
  }
  revalidatePath("/settings/api-tokens");
  revalidatePath("/profile");
}
