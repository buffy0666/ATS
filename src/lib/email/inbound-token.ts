import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless, signed reply-address tokens for inbound email capture.
 *
 * Outbound mail to a candidate sets Reply-To to
 *   reply+<candidateId>.<sig>@<INBOUND_EMAIL_DOMAIN>
 * where <sig> is a short HMAC over the candidateId. When the candidate
 * replies, the Resend inbound webhook parses this address back to the
 * candidateId (verifying the signature) so we can attach the reply to the
 * right candidate without a lookup table.
 *
 * candidateId is a cuid (`[a-z0-9]+`), so the local part stays well under the
 * RFC 5321 64-octet limit (`reply+` + ~25 + `.` + 10 ≈ 42 chars).
 *
 * Signing key: INBOUND_TOKEN_SECRET if set, else AUTH_SECRET (always present
 * in this app — see lib/crypto). No new env var is strictly required.
 */

const SIG_LEN = 10; // hex chars of the truncated HMAC
const PREFIX = "reply+";

function signingKey(): string {
  const secret = process.env.INBOUND_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("INBOUND_TOKEN_SECRET or AUTH_SECRET must be set to sign reply tokens.");
  }
  return secret;
}

function sign(candidateId: string): string {
  return createHmac("sha256", signingKey()).update(candidateId).digest("hex").slice(0, SIG_LEN);
}

/** The receiving domain (e.g. "inbound.t3xglobal.io"), or null if inbound capture isn't configured. */
export function inboundDomain(): string | null {
  const d = process.env.INBOUND_EMAIL_DOMAIN?.trim();
  return d ? d.replace(/^@/, "").toLowerCase() : null;
}

/** Is hands-free inbound capture configured (receiving domain set)? */
export function inboundCaptureEnabled(): boolean {
  return inboundDomain() !== null;
}

/**
 * Build the Reply-To address that routes a candidate's reply back into the
 * ATS. Returns null when inbound capture isn't configured, so callers fall
 * back to their existing Reply-To.
 */
export function makeReplyAddress(candidateId: string): string | null {
  const domain = inboundDomain();
  if (!domain) return null;
  // cuid only — never inject odd chars into an address local part.
  if (!/^[a-z0-9]+$/i.test(candidateId)) return null;
  return `${PREFIX}${candidateId}.${sign(candidateId)}@${domain}`;
}

/**
 * Parse a reply-token address back to its candidateId, verifying the
 * signature. Tolerates a "Name <addr>" wrapper. Returns null if the address
 * isn't a valid token for our domain.
 */
export function parseReplyAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const domain = inboundDomain();
  if (!domain) return null;

  const angle = /<([^>]+)>/.exec(address);
  const addr = (angle ? angle[1] : address).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at < 0) return null;
  if (addr.slice(at + 1) !== domain) return null;

  const local = addr.slice(0, at);
  if (!local.startsWith(PREFIX)) return null;
  const tok = local.slice(PREFIX.length);
  const dot = tok.lastIndexOf(".");
  if (dot < 0) return null;

  const candidateId = tok.slice(0, dot);
  const sig = tok.slice(dot + 1);
  if (!/^[a-z0-9]+$/.test(candidateId) || !/^[a-f0-9]+$/.test(sig)) return null;

  const expected = sign(candidateId);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return candidateId;
}

/**
 * Scan a list of recipient addresses (to/cc/reply_to) and return the first
 * one that's a valid reply token, as its candidateId.
 */
export function findCandidateIdInAddresses(addresses: (string | null | undefined)[]): string | null {
  for (const a of addresses) {
    const id = parseReplyAddress(a);
    if (id) return id;
  }
  return null;
}
