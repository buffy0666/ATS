import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { recordEngagement, recordReply } from "@/lib/email/tracking";

/**
 * Resend webhook receiver.
 *
 * Handles two kinds of inbound traffic:
 *   1. Engagement events (email.opened / .clicked / .bounced / .complained)
 *      — signed with the Svix scheme Resend uses. Verified with
 *      RESEND_WEBHOOK_SECRET, then matched to an EmailLog by Resend message id.
 *   2. Inbound replies (email.received, via Resend Inbound) — same signature
 *      scheme; matched to a candidate by sender address, and auto-stops their
 *      sequence.
 *
 * Security: the raw body + svix-* headers are verified before we trust
 * anything. Without RESEND_WEBHOOK_SECRET set we reject (fail closed).
 *
 * Always returns 2xx for accepted-but-ignored events so Resend doesn't retry
 * forever; returns 4xx only for signature failures / malformed payloads.
 */

export const runtime = "nodejs";

type ResendEvent = {
  type: string;
  created_at?: string;
  data?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET not set — rejecting webhook.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ResendEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, headers) as ResendEvent;
  } catch (err) {
    console.warn("Resend webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    // Log but still 200 — a transient handler error shouldn't make Resend
    // hammer us with retries; we can reconcile later if needed.
    console.error("Resend webhook handler error:", err);
  }

  return NextResponse.json({ ok: true });
}

async function handleEvent(event: ResendEvent): Promise<void> {
  const data = event.data ?? {};
  const at = parseDate(event.created_at) ?? new Date();
  // Resend engagement events carry the message id as data.email_id (newer)
  // or data.id (older). Accept either.
  const messageId =
    (typeof data.email_id === "string" && data.email_id) ||
    (typeof data.id === "string" && data.id) ||
    "";

  switch (event.type) {
    case "email.opened":
      await recordEngagement(messageId, "opened", at);
      return;
    case "email.clicked":
      await recordEngagement(messageId, "clicked", at);
      return;
    case "email.bounced":
      await recordEngagement(messageId, "bounced", at);
      return;
    case "email.complained":
      await recordEngagement(messageId, "complained", at);
      return;
    case "email.received":
      // Resend Inbound — a reply landed. Shape: from, subject, text, html,
      // headers (Message-ID). Field names per Resend Inbound payload.
      await recordReply({
        fromEmail: extractFromEmail(data),
        organizationId: null, // resolved by candidate lookup (email is per-org-unique-ish)
        subject: typeof data.subject === "string" ? data.subject : "",
        text: typeof data.text === "string" ? data.text : null,
        html: typeof data.html === "string" ? data.html : null,
        messageId: extractMessageId(data),
        receivedAt: at,
      });
      return;
    default:
      // Unhandled event type — accept + ignore.
      return;
  }
}

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractFromEmail(data: Record<string, unknown>): string {
  // `from` may be "Name <addr@x.com>" or a plain address, or an object.
  const raw = data.from;
  if (typeof raw === "string") {
    const m = raw.match(/<([^>]+)>/);
    return (m ? m[1] : raw).trim();
  }
  if (raw && typeof raw === "object" && "address" in raw) {
    const addr = (raw as { address?: unknown }).address;
    if (typeof addr === "string") return addr.trim();
  }
  return "";
}

function extractMessageId(data: Record<string, unknown>): string | null {
  const headers = data.headers;
  if (headers && typeof headers === "object") {
    const mid = (headers as Record<string, unknown>)["message-id"] ??
      (headers as Record<string, unknown>)["Message-ID"];
    if (typeof mid === "string") return mid;
  }
  if (typeof data.message_id === "string") return data.message_id;
  return null;
}
