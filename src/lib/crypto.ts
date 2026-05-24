import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Secret-at-rest encryption helpers using AES-256-GCM.
 *
 * The encryption key is derived from AUTH_SECRET via SHA-256. This means:
 *  - The DB never holds plaintext secrets (API keys etc.).
 *  - Anyone with both the DB *and* the AUTH_SECRET env var can decrypt — that
 *    is intentional. The threat we're protecting against is a leaked DB dump
 *    on its own, which is by far the most common exposure path. Rotating
 *    AUTH_SECRET invalidates every encrypted blob (and every session, so it's
 *    a deliberate "rotate everything" event).
 *
 * Output format is a single string: `v1:<iv-base64>:<authtag-base64>:<ciphertext-base64>`.
 * The version prefix lets us migrate the algorithm later without breaking
 * existing rows.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard
const VERSION = "v1";

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET must be set (at least 16 chars) before encrypting secrets.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError("encryptSecret expects a string.");
  }
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  if (!blob) return "";
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognized encrypted blob format.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Return a UI-safe preview of an API key — first 4 + last 4 chars with the
 * middle masked. Never log the full key.
 */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
