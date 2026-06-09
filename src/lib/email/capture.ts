import "server-only";

import { EmailDirection, EmailSource, EmailStatus, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

/**
 * Shared inbound-email capture primitives.
 *
 * Used by both the Chrome-extension / Outlook-add-in capture endpoint
 * (`api/external/emails`) and the Resend inbound webhook (`api/inbound/resend`)
 * so candidate-matching, name-splitting, provider labelling and Message-ID
 * dedupe live in exactly one place.
 */

export type ThreadMessageLike = {
  from: string;
  to: string[];
  cc: string[];
  direction: EmailDirection;
  fromName?: string;
};

/**
 * Figure out the "external party" (candidate) address for a thread — the
 * address that isn't on the recruiter's side. The recruiter's address shows
 * up as From: for OUTBOUND messages and as a To/Cc recipient for INBOUND ones.
 * The address that most often appears as the From of INBOUND messages, or as
 * a recipient of OUTBOUND ones, is the external party.
 */
export function inferExternalParty(
  messages: ThreadMessageLike[],
): { email: string; name?: string } | null {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const m of messages) {
    if (m.direction === EmailDirection.INBOUND) {
      counts.set(m.from, (counts.get(m.from) ?? 0) + 2);
      if (m.fromName) names.set(m.from, m.fromName);
    } else {
      for (const addr of [...m.to, ...m.cc]) {
        counts.set(addr, (counts.get(addr) ?? 0) + 1);
      }
    }
  }
  let best: { email: string; count: number } | null = null;
  for (const [email, count] of counts) {
    if (!best || count > best.count) best = { email, count };
  }
  if (!best) return null;
  return { email: best.email, name: names.get(best.email) };
}

/**
 * Best-effort split of a display name into first/last for a quick-created
 * candidate. Handles "First Last", "Last, First", a single token, or no name
 * (falls back to the email local-part so the candidate isn't blank-named).
 */
export function splitName(
  name: string | undefined,
  email: string,
): { firstName: string; lastName: string } {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    const local = email.split("@")[0] || email;
    return { firstName: local, lastName: "" };
  }
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",").map((s) => s.trim());
    return { firstName: first || last || trimmed, lastName: first ? last : "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Map a capture source to the `provider` label on EmailLog. Historically
 * `provider` meant "which service handled this (resend/mailgun)"; for captured
 * mail it's "which client/path we captured from", so existing "via X" UI still
 * renders sensibly.
 */
export function sourceToProviderLabel(source: EmailSource): string {
  switch (source) {
    case EmailSource.EXTENSION_OUTLOOK:
      return "outlook-web";
    case EmailSource.EXTENSION_GMAIL:
      return "gmail-web";
    case EmailSource.WEBHOOK:
      return "webhook";
    case EmailSource.OAUTH_GMAIL:
      return "gmail-oauth";
    case EmailSource.OAUTH_OUTLOOK:
      return "outlook-oauth";
    case EmailSource.MANUAL:
      return "manual";
    case EmailSource.COMPOSER:
    default:
      return "composer";
  }
}

/** Find a candidate in an org by primary or alternate email. */
export async function findCandidateByEmail(orgId: string, email: string) {
  return prisma.candidate.findFirst({
    where: { organizationId: orgId, OR: [{ email }, { alternateEmail: email }] },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

/**
 * When we don't know the org up front (inbound webhook), find the candidate by
 * sender address across all tenants. Returns the match only if it's
 * unambiguous (exactly one candidate org-wide has that address) so we never
 * cross-link two tenants that happen to share a candidate email.
 */
export async function findCandidateBySenderUnambiguous(
  email: string,
): Promise<{ id: string; organizationId: string } | null> {
  const matches = await prisma.candidate.findMany({
    where: { OR: [{ email }, { alternateEmail: email }] },
    select: { id: true, organizationId: true },
    take: 2,
  });
  if (matches.length !== 1) return null;
  const m = matches[0];
  return m.organizationId ? { id: m.id, organizationId: m.organizationId } : null;
}

/**
 * Resolve the recruiter to own an INBOUND EmailLog row (`fromUserId` is
 * required). Prefer whoever last emailed this candidate, then the candidate's
 * sourcer, then any active OWNER/ADMIN in the org.
 */
export async function resolveOwningRecruiter(
  candidateId: string,
  orgId: string,
): Promise<string | null> {
  const lastOutbound = await prisma.emailLog.findFirst({
    where: { candidateId, organizationId: orgId, direction: EmailDirection.OUTBOUND },
    orderBy: { sentAt: "desc" },
    select: { fromUserId: true },
  });
  if (lastOutbound?.fromUserId) return lastOutbound.fromUserId;

  const cand = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { sourcedById: true },
  });
  if (cand?.sourcedById) return cand.sourcedById;

  // Enum order is OWNER < ADMIN < RECRUITER, so ascending prefers an OWNER.
  const fallback = await prisma.user.findFirst({
    where: { organizationId: orgId, active: true },
    orderBy: { role: "asc" },
    select: { id: true },
  });
  return fallback?.id ?? null;
}

export type RecordInboundArgs = {
  organizationId: string;
  candidateId: string;
  fromUserId: string;
  /** From: header — the candidate's address. */
  fromEmail: string;
  /** Recipient(s) we received on (our inbound address), joined for display. */
  to: string;
  cc?: string[];
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  messageId?: string | null;
  provider: string;
  /** Provider-side id (e.g. Resend received-email id). */
  providerMessageId?: string | null;
  /** Date header / received time. */
  sentAt: Date;
  source?: EmailSource;
};

/**
 * Create an INBOUND EmailLog, deduped by Message-ID within the org so the same
 * reply captured twice (webhook retry, or extension + webhook) is one row.
 */
export async function recordInboundEmail(
  args: RecordInboundArgs,
): Promise<{ created: boolean; emailLogId?: string }> {
  if (args.messageId) {
    const existing = await prisma.emailLog.findFirst({
      where: { messageId: args.messageId, organizationId: args.organizationId },
      select: { id: true },
    });
    if (existing) return { created: false, emailLogId: existing.id };
  }

  try {
    const row = await prisma.emailLog.create({
      data: {
        candidateId: args.candidateId,
        fromUserId: args.fromUserId,
        organizationId: args.organizationId,
        fromEmail: args.fromEmail,
        to: args.to,
        cc: args.cc ?? [],
        subject: args.subject || "(no subject)",
        bodyText: args.bodyText ?? null,
        bodyHtml: args.bodyHtml ?? null,
        direction: EmailDirection.INBOUND,
        source: args.source ?? EmailSource.WEBHOOK,
        messageId: args.messageId ?? null,
        provider: args.provider,
        providerMessageId: args.providerMessageId ?? null,
        status: EmailStatus.SENT,
        sentAt: args.sentAt,
      },
      select: { id: true },
    });
    return { created: true, emailLogId: row.id };
  } catch (err) {
    // Lost a race on Message-ID — re-fetch and treat as already-captured.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && args.messageId) {
      const existing = await prisma.emailLog.findFirst({
        where: { messageId: args.messageId, organizationId: args.organizationId },
        select: { id: true },
      });
      return { created: false, emailLogId: existing?.id };
    }
    throw err;
  }
}
