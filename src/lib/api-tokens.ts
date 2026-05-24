import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_PREFIX = "ats_";

/**
 * Generates a new API token. The plaintext token is returned ONCE — callers
 * must show it to the user immediately; only the SHA-256 hash is stored.
 *
 * Token shape: "ats_" + 64 hex chars (32 bytes of entropy). The first 12 chars
 * of the prefixed token are stored separately as a UI preview ("ats_a3f2b1...").
 */
export async function createApiToken(
  userId: string,
  name: string,
): Promise<{ token: string; record: { id: string; tokenPrefix: string; name: string } }> {
  const random = randomBytes(32).toString("hex");
  const token = `${TOKEN_PREFIX}${random}`;
  const tokenHash = sha256Hex(token);
  const tokenPrefix = token.slice(0, 12);

  const record = await prisma.apiToken.create({
    data: { userId, name, tokenHash, tokenPrefix },
    select: { id: true, tokenPrefix: true, name: true },
  });

  return { token, record };
}

/**
 * Look up the user behind a Bearer token. Updates lastUsedAt on success.
 * Returns null when the token is unknown, revoked, or malformed.
 */
export async function authenticateApiToken(token: string): Promise<{ userId: string; tokenId: string } | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const tokenHash = sha256Hex(token);

  const record = await prisma.apiToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!record || record.revokedAt) return null;

  // Fire-and-forget lastUsedAt bump; don't block the request on it.
  prisma.apiToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { userId: record.userId, tokenId: record.id };
}

export async function revokeApiToken(userId: string, tokenId: string): Promise<void> {
  await prisma.apiToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
