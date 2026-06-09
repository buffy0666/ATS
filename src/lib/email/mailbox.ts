import "server-only";

import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  getAccessToken,
  sendGmail,
  gmailConfigured,
  type GmailMessage,
} from "./gmail";

/**
 * Per-user mailbox connections (Phase 2). The composer + sequence engine send
 * "from the recruiter's own address" through their connected Gmail.
 *
 * Policy (per product decision): sending REQUIRES a connected mailbox. Callers
 * use sendFromUserMailbox(); if the user hasn't connected one it throws
 * MailboxNotConnectedError, which the UI surfaces as a "Connect Gmail" gate.
 */

export class MailboxNotConnectedError extends Error {
  constructor(message = "No sending mailbox connected. Connect Gmail in Settings to send.") {
    super(message);
    this.name = "MailboxNotConnectedError";
  }
}

export type MailboxStatus =
  | { connected: true; provider: string; email: string }
  | { connected: false; configured: boolean };

/** Read the current user's connected mailbox status (for the Settings UI). */
export async function getMailboxStatus(userId: string): Promise<MailboxStatus> {
  const conn = await prisma.mailboxConnection.findFirst({
    where: { userId, provider: "google" },
    select: { provider: true, email: true },
  });
  if (!conn) return { connected: false, configured: gmailConfigured() };
  return { connected: true, provider: conn.provider, email: conn.email };
}

/** Persist (or replace) a user's Gmail connection after OAuth. */
export async function saveGoogleConnection(input: {
  userId: string;
  email: string;
  refreshToken: string;
  scope: string | null;
}): Promise<void> {
  const refreshTokenEncrypted = encryptSecret(input.refreshToken);
  await prisma.mailboxConnection.upsert({
    where: { userId_provider: { userId: input.userId, provider: "google" } },
    create: {
      userId: input.userId,
      provider: "google",
      email: input.email,
      refreshTokenEncrypted,
      scope: input.scope,
    },
    update: {
      email: input.email,
      refreshTokenEncrypted,
      scope: input.scope,
    },
  });
}

/** Disconnect a user's mailbox. */
export async function disconnectMailbox(userId: string): Promise<void> {
  await prisma.mailboxConnection.deleteMany({ where: { userId, provider: "google" } });
}

export type SendResult = { id: string; provider: string; from: string };

/**
 * Send an email AS the given user, from their connected Gmail. Throws
 * MailboxNotConnectedError if they haven't connected one. The `from` is forced
 * to the connected address (you can't spoof a different sender via Gmail).
 */
export async function sendFromUserMailbox(
  userId: string,
  msg: Omit<GmailMessage, "from">,
): Promise<SendResult> {
  const conn = await prisma.mailboxConnection.findFirst({
    where: { userId, provider: "google" },
    select: { email: true, refreshTokenEncrypted: true },
  });
  if (!conn) throw new MailboxNotConnectedError();

  const refreshToken = decryptSecret(conn.refreshTokenEncrypted);
  const accessToken = await getAccessToken(refreshToken);

  const senderName = await resolveSenderName(userId);
  const from = senderName ? `${senderName} <${conn.email}>` : conn.email;

  const result = await sendGmail(accessToken, { ...msg, from });
  return { id: result.id, provider: "gmail", from: conn.email };
}

async function resolveSenderName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return user?.name ?? null;
}

/** True if the user has a connected mailbox (cheap gate check). */
export async function hasMailbox(userId: string): Promise<boolean> {
  const c = await prisma.mailboxConnection.count({ where: { userId, provider: "google" } });
  return c > 0;
}
