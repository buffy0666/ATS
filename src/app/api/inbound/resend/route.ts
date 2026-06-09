import { NextRequest } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import {
  findCandidateBySenderUnambiguous,
  recordInboundEmail,
  resolveOwningRecruiter,
} from "@/lib/email/capture";
import { findCandidateIdInAddresses } from "@/lib/email/inbound-token";

/**
 * Resend Inbound webhook — hands-free candidate reply capture.
 *
 * Flow:
 *  1. Resend POSTs a Svix-signed `email.received` event (metadata only).
 *  2. We verify the signature, then fetch the full email via the Received
 *     Emails API (the webhook body has no text/html).
 *  3. Resolve the candidate: first by the signed reply token in any recipient
 *     address (reply+<id>.<sig>@<inbound domain>), else by an unambiguous
 *     sender-address match.
 *  4. Record an INBOUND EmailLog (deduped by Message-ID) and forward a copy to
 *     the owning recruiter's inbox so the reply lands in the ATS *and* Gmail.
 *
 * Resend stores inbound mail even if this endpoint errors, and retries on
 * non-2xx — so transient failures here don't lose mail.
 */

// node runtime: needs the Resend SDK + crypto-based Svix verification.
export const runtime = "nodejs";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractAddress(headerVal: string | null | undefined): string | null {
  if (!headerVal) return null;
  const m = /<([^>]+)>/.exec(headerVal);
  return (m ? m[1] : headerVal).trim().toLowerCase();
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  if (!secret || !apiKey) {
    console.error("[inbound] missing RESEND_INBOUND_WEBHOOK_SECRET or RESEND_API_KEY");
    return jsonResponse({ error: "Inbound email not configured." }, 500);
  }

  const resend = new Resend(apiKey);

  // Raw body is required for Svix signature verification.
  const payload = await request.text();

  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      // Resend's verify wants the three Svix header values, not the Headers object.
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    });
  } catch (e) {
    console.warn("[inbound] signature verification failed:", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Invalid signature." }, 401);
  }

  // We only act on received mail; ack everything else so Resend stops retrying.
  if (event.type !== "email.received") {
    return new Response(null, { status: 204 });
  }

  const receivedId = event.data.email_id;

  try {
    // The webhook carries metadata only — fetch the full email for the body.
    const { data: full, error } = await resend.emails.receiving.get(receivedId);
    if (error || !full) {
      console.error("[inbound] failed to fetch received email", receivedId, error);
      // 500 → Resend retries later.
      return jsonResponse({ error: "Could not fetch email content." }, 500);
    }

    const fromEmail = extractAddress(full.from);
    const recipientAddrs = [
      ...(full.to ?? []),
      ...(full.cc ?? []),
      ...(full.reply_to ?? []),
    ];

    // 1) Primary: signed reply token in any recipient address.
    let candidateId: string | null = findCandidateIdInAddresses(recipientAddrs);
    let orgId: string | null = null;

    if (candidateId) {
      const cand = await prisma.candidate.findUnique({
        where: { id: candidateId },
        select: { organizationId: true },
      });
      if (cand?.organizationId) orgId = cand.organizationId;
      else candidateId = null; // token pointed at a candidate that's gone
    }

    // 2) Fallback: unambiguous sender-address match (the candidate is the From).
    if ((!candidateId || !orgId) && fromEmail) {
      const match = await findCandidateBySenderUnambiguous(fromEmail);
      if (match) {
        candidateId = match.id;
        orgId = match.organizationId;
      }
    }

    if (!candidateId || !orgId) {
      // Nothing to attach to — ack so Resend doesn't retry forever.
      console.warn("[inbound] no candidate match for", fromEmail, "msg", full.message_id);
      return jsonResponse({ status: "no-candidate-matched" }, 200);
    }

    const fromUserId = await resolveOwningRecruiter(candidateId, orgId);
    if (!fromUserId) {
      console.error("[inbound] no recruiter to own inbound row for candidate", candidateId);
      return jsonResponse({ error: "No owning recruiter." }, 500);
    }

    const { created, emailLogId } = await recordInboundEmail({
      organizationId: orgId,
      candidateId,
      fromUserId,
      fromEmail: fromEmail ?? "",
      to: (full.to ?? []).join(", "),
      cc: full.cc ?? [],
      subject: full.subject ?? "(no subject)",
      bodyText: full.text ?? null,
      bodyHtml: full.html ?? null,
      messageId: full.message_id ?? null,
      provider: "resend-inbound",
      providerMessageId: receivedId,
      sentAt: parseDate(full.created_at) ?? new Date(),
    });

    // Forward a copy to the owning recruiter's inbox — the "also in Gmail"
    // half. Only on first capture, so webhook retries don't re-forward.
    if (created) {
      const recruiter = await prisma.user.findUnique({
        where: { id: fromUserId },
        select: { email: true },
      });
      const fwdFrom = process.env.EMAIL_FROM_DEFAULT;
      if (recruiter?.email && fwdFrom) {
        try {
          await resend.emails.receiving.forward({
            emailId: receivedId,
            to: recruiter.email,
            from: fwdFrom,
            passthrough: true,
          });
        } catch (e) {
          // Non-fatal: the reply is already captured in the ATS.
          console.warn("[inbound] forward failed:", e instanceof Error ? e.message : e);
        }
      }
    }

    return jsonResponse({ status: "captured", emailLogId, created }, 200);
  } catch (e) {
    console.error("[inbound] handler error:", e);
    return jsonResponse({ error: "Internal error." }, 500);
  }
}
