import "server-only";

import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Anthropic OAuth access-token refresh for AIConfig rows with
 * authMode = "oauth" and a stored refresh token.
 *
 * The access token (in apiKeyEncrypted) is short-lived. When it's expired —
 * or its expiry is unknown, e.g. right after an admin pastes fresh tokens —
 * we post the standard refresh_token grant, persist the rotated tokens, and
 * hand the new access token to the provider. A row with NO refresh token
 * keeps the legacy paste-and-expire behavior untouched.
 */

const ANTHROPIC_TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token";

/**
 * Claude Code's public OAuth client id — the issuer of the tokens minted by
 * `claude` / `ant auth login` flows. Public client (no secret). Used as the
 * default when the admin doesn't supply a client id alongside the refresh
 * token; tokens issued to a different client need their own id.
 */
export const DEFAULT_ANTHROPIC_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/** Refresh this long before the recorded expiry so in-flight calls never race it. */
const EXPIRY_LEEWAY_MS = 5 * 60 * 1000;

export type OAuthRefreshFields = {
  id: string;
  apiKeyEncrypted: string | null;
  oauthRefreshTokenEncrypted: string | null;
  oauthClientId: string | null;
  oauthExpiresAt: Date | null;
};

export function oauthTokenIsStale(row: OAuthRefreshFields, now = Date.now()): boolean {
  if (!row.oauthRefreshTokenEncrypted) return false; // nothing we can do about it
  if (!row.oauthExpiresAt) return true; // unknown expiry — refresh to learn it
  return row.oauthExpiresAt.getTime() - now < EXPIRY_LEEWAY_MS;
}

/**
 * Refresh the access token for an AIConfig row and persist the result.
 * Returns the fresh access token, or null when refresh isn't possible /
 * failed (caller falls back to the stored token — it may still be valid).
 *
 * Concurrency: two serverless instances may refresh at once. Anthropic
 * rotates refresh tokens, so the loser's grant can fail — in that case we
 * re-read the row, which by then carries the winner's fresh tokens.
 */
export async function refreshAnthropicOAuthToken(
  row: OAuthRefreshFields,
): Promise<string | null> {
  if (!row.oauthRefreshTokenEncrypted) return null;

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(row.oauthRefreshTokenEncrypted);
  } catch {
    return null; // AUTH_SECRET rotated; admin must re-save tokens
  }

  const clientId = row.oauthClientId || DEFAULT_ANTHROPIC_OAUTH_CLIENT_ID;

  try {
    const response = await fetch(ANTHROPIC_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      // Most likely a rotated refresh token already used by a concurrent
      // instance. Re-read the row — the winner persisted fresh tokens.
      const latest = await prisma.aIConfig.findUnique({
        where: { id: row.id },
        select: { apiKeyEncrypted: true, oauthExpiresAt: true },
      });
      if (
        latest?.apiKeyEncrypted &&
        latest.oauthExpiresAt &&
        latest.oauthExpiresAt.getTime() - Date.now() > EXPIRY_LEEWAY_MS
      ) {
        try {
          return decryptSecret(latest.apiKeyEncrypted);
        } catch {
          return null;
        }
      }
      console.error(
        `[ai-oauth] refresh failed for AIConfig ${row.id}: HTTP ${response.status}`,
      );
      return null;
    }

    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) {
      console.error(`[ai-oauth] refresh response had no access_token (AIConfig ${row.id})`);
      return null;
    }

    const expiresAt = json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null;

    await prisma.aIConfig.update({
      where: { id: row.id },
      data: {
        apiKeyEncrypted: encryptSecret(json.access_token),
        // Anthropic rotates refresh tokens; keep the old one if none returned.
        ...(json.refresh_token
          ? { oauthRefreshTokenEncrypted: encryptSecret(json.refresh_token) }
          : {}),
        oauthExpiresAt: expiresAt,
      },
    });

    return json.access_token;
  } catch (err) {
    console.error(
      `[ai-oauth] refresh errored for AIConfig ${row.id}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
