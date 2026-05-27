import { NextRequest } from "next/server";
import { z } from "zod";
import {
  EmailDirection,
  EmailSource,
  EmailStatus,
  Prisma,
} from "@/generated/prisma";
import { authenticateApiToken } from "@/lib/api-tokens";
import { prisma } from "@/lib/prisma";

/**
 * External email capture endpoint.
 *
 * Auth: `Authorization: Bearer <ats_xxx>` token issued at /settings/api-tokens.
 * Used by the Chrome extension when the user clicks "+ Add to ATS" on an
 * email/thread in Outlook web (and, later, Gmail).
 *
 * Behavior:
 *  - Accepts a single email OR an array of emails (a thread).
 *  - Matches each email to a Candidate:
 *      - INBOUND  → match by from (the candidate is the sender)
 *      - OUTBOUND → match by any of to/cc/bcc (we sent to the candidate)
 *  - All matching is scoped to the API token's Organization so two
 *    tenants on the same DB can have candidates at the same email.
 *  - Dedupes by Message-ID — clicking "Add to ATS" twice on the same
 *    thread doesn't create duplicate rows.
 *  - When no candidate matches any of the emails in the payload, the
 *    response signals "no-candidate-matched" with the best-effort
 *    "external party" email + name so the extension can show a
 *    "Create candidate" toast.
 */

const messageSchema = z.object({
  // RFC 5322 headers
  messageId: z.string().trim().max(500).optional(),
  from: z.string().trim().toLowerCase().email().max(200),
  fromName: z.string().trim().max(200).optional(),
  to: z.array(z.string().trim().toLowerCase().email().max(200)).min(1).max(50),
  cc: z.array(z.string().trim().toLowerCase().email().max(200)).max(50).default([]),
  bcc: z.array(z.string().trim().toLowerCase().email().max(200)).max(50).default([]),
  subject: z.string().trim().max(998).default(""),
  // Date header — ISO 8601 from the extension. Falls back to now if missing.
  sentAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }),
  bodyText: z.string().max(100_000).optional(),
  bodyHtml: z.string().max(500_000).optional(),
  direction: z.nativeEnum(EmailDirection),
});

const bodySchema = z.object({
  // The capturing client's identifier. Used for the EmailSource on the
  // resulting rows. Required so we can tell extension-captured rows apart
  // from future webhook/OAuth ones.
  source: z.nativeEnum(EmailSource),
  // The extension typically sends the whole thread in one POST so the
  // server can persist it atomically. A single-message client (manual
  // paste, future webhook) can wrap a single message in `messages: [x]`.
  messages: z.array(messageSchema).min(1).max(50),
  // When true and no candidate matches the external party, create a
  // candidate on the fly (from the From: name + email) and capture the
  // emails onto it — so the add-in's "Create candidate & save email" is
  // a single round-trip instead of "create, then separately capture".
  createCandidateIfMissing: z.boolean().optional().default(false),
});

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && (origin.startsWith("chrome-extension://") || origin === process.env.APP_URL)
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));

  // Bearer token
  const authHeader = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(authHeader);
  if (!m) {
    return json({ error: "Missing Bearer token." }, 401, cors);
  }
  const auth = await authenticateApiToken(m[1]);
  if (!auth) {
    return json({ error: "Invalid or revoked token." }, 401, cors);
  }
  if (!auth.organizationId) {
    return json(
      {
        error:
          "This API token has no organization — re-issue it at /settings/api-tokens.",
      },
      401,
      cors,
    );
  }

  // Body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400, cors);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(
      {
        error: "Invalid payload.",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      422,
      cors,
    );
  }
  const { source, messages, createCandidateIfMissing } = parsed.data;
  const orgId = auth.organizationId;

  // Pre-fetch any existing rows with these messageIds so we can dedupe
  // without N round-trips. Skip messages without a Message-ID — those
  // can't be deduped and will always insert.
  const messageIds = messages.map((m) => m.messageId).filter((v): v is string => !!v);
  const alreadyHave = messageIds.length
    ? await prisma.emailLog.findMany({
        where: { messageId: { in: messageIds }, organizationId: orgId },
        select: { messageId: true },
      })
    : [];
  const seenMessageIds = new Set(alreadyHave.map((r) => r.messageId).filter((v): v is string => !!v));

  // Find the "external party" for this thread — the email address that
  // isn't the recruiter's. For INBOUND that's the from-header sender;
  // for OUTBOUND it's the first recipient that isn't a known user in
  // this org. We use this to match a candidate (and to populate the
  // "Create candidate" toast when no match).
  const externalParty = inferExternalParty(messages);

  // Candidate match. Scoped to this org so two tenants don't cross-link.
  let candidate = externalParty
    ? await prisma.candidate.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            { email: externalParty.email },
            { alternateEmail: externalParty.email },
          ],
        },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : null;

  // One-click "Create candidate & save email": if asked and no match,
  // mint a candidate from the external party's From: name + email, then
  // fall through to capture the emails onto it. Names are best-effort
  // split ("James Blackwell" → first/last; bare email → email as first).
  let createdCandidate = false;
  if (!candidate && createCandidateIfMissing && externalParty) {
    const { firstName, lastName } = splitName(externalParty.name, externalParty.email);
    try {
      candidate = await prisma.candidate.create({
        data: {
          email: externalParty.email,
          firstName,
          lastName,
          organizationId: orgId,
          sourcedById: auth.userId,
          source: "Email capture",
        },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      createdCandidate = true;
    } catch (err) {
      // Lost a race to another capture that created the same email —
      // re-fetch and continue rather than failing.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        candidate = await prisma.candidate.findFirst({
          where: { organizationId: orgId, email: externalParty.email },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      } else {
        throw err;
      }
    }
  }

  // Capture rows. We only create EmailLog rows when there's a candidate
  // to attach to (matched or just-created above).
  let captured = 0;
  let skipped = 0;

  if (candidate) {
    for (const msg of messages) {
      if (msg.messageId && seenMessageIds.has(msg.messageId)) {
        skipped++;
        continue;
      }
      try {
        await prisma.emailLog.create({
          data: {
            candidateId: candidate.id,
            fromUserId: auth.userId,
            fromEmail: msg.from,
            to: msg.to.join(", "),
            cc: msg.cc,
            bcc: msg.bcc,
            subject: msg.subject || "(no subject)",
            bodyText: msg.bodyText ?? null,
            bodyHtml: msg.bodyHtml ?? null,
            direction: msg.direction,
            source,
            messageId: msg.messageId ?? null,
            provider: sourceToProviderLabel(source),
            status: EmailStatus.SENT,
            sentAt: msg.sentAt ?? new Date(),
            organizationId: orgId,
          },
        });
        captured++;
        if (msg.messageId) seenMessageIds.add(msg.messageId);
      } catch (err) {
        // Race condition: another extension click for the same thread
        // raced us and inserted the same messageId. Treat as "skipped".
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          skipped++;
          continue;
        }
        throw err;
      }
    }
  }

  const appOrigin = (process.env.APP_URL || "").replace(/\/+$/, "") || request.nextUrl.origin;

  if (candidate) {
    return json(
      {
        status: "captured" as const,
        createdCandidate,
        candidate: {
          id: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          url: `${appOrigin}/candidates/${candidate.id}`,
        },
        captured,
        skipped,
      },
      200,
      cors,
    );
  }

  return json(
    {
      status: "no-candidate-matched" as const,
      unmatched: externalParty
        ? { email: externalParty.email, name: externalParty.name ?? null }
        : null,
      createCandidateUrl: externalParty
        ? `${appOrigin}/candidates/new?email=${encodeURIComponent(externalParty.email)}${
            externalParty.name
              ? `&name=${encodeURIComponent(externalParty.name)}`
              : ""
          }`
        : null,
    },
    200,
    cors,
  );
}

/**
 * Figure out the "external party" email for a thread — the address that
 * isn't on the recruiter's side. The recruiter's address shows up as
 * From: for OUTBOUND messages and as a To/Cc recipient for INBOUND ones.
 *
 * Strategy: the address that appears most often as the FROM of INBOUND
 * messages, OR as the recipient of OUTBOUND messages, is the external
 * party. In a typical thread the candidate is exactly one address.
 */
function inferExternalParty(
  messages: { from: string; to: string[]; cc: string[]; direction: EmailDirection; fromName?: string }[],
): { email: string; name?: string } | null {
  const counts = new Map<string, number>();
  const names = new Map<string, string>();
  for (const m of messages) {
    if (m.direction === EmailDirection.INBOUND) {
      counts.set(m.from, (counts.get(m.from) ?? 0) + 2);
      if (m.fromName) names.set(m.from, m.fromName);
    } else {
      // OUTBOUND — the external party is one of the recipients.
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
 * candidate. Handles "First Last", "Last, First", a single token, or no
 * name at all (falls back to the email local-part as the first name so
 * the candidate isn't blank-named).
 */
function splitName(
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

function sourceToProviderLabel(source: EmailSource): string {
  // The `provider` field on EmailLog historically meant "which email
  // service handled this (resend/mailgun)". For captured emails the
  // analogous concept is which client we captured from. We pack that
  // into provider so existing UI showing "via resend" / "via mailgun"
  // also shows "via outlook-web" etc.
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

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
