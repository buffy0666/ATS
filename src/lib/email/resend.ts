import { Resend } from "resend";
import type { EmailPayload, EmailProvider, EmailSendResult } from "./provider";
import { EmailProviderError } from "./provider";

export class ResendProvider implements EmailProvider {
  readonly name = "resend";
  private client: Resend;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.startsWith("re_replace_me")) {
      throw new Error(
        "RESEND_API_KEY is missing or placeholder. Get one at https://resend.com/api-keys.",
      );
    }
    this.client = new Resend(apiKey);
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    const from = payload.from;
    if (!from) {
      throw new EmailProviderError(
        this.name,
        "Missing 'from' address. Set EMAIL_FROM_DEFAULT or pass `from` explicitly.",
      );
    }
    if (!payload.html && !payload.text) {
      throw new EmailProviderError(this.name, "Either html or text body is required.");
    }

    // Resend's CreateEmailOptions is a discriminated union — passing both
    // html and text as `string | undefined` confuses it, so build the
    // content portion separately and cast it.
    const content = (
      payload.html ? { html: payload.html } : { text: payload.text! }
    ) as { html: string } | { text: string };

    // Pull attachments out of the loosely-typed providerMeta. Resend's SDK
    // accepts `attachments: [{ filename, content (base64 or Buffer), contentType }]`.
    const attachments = Array.isArray(payload.providerMeta?.attachments)
      ? (payload.providerMeta.attachments as Array<{
          filename: string;
          content: string;
          contentType?: string;
        }>)
      : undefined;

    // Future-dated sends — Resend's API accepts an ISO timestamp via `scheduledAt`
    // and holds the message until then. We forward whatever the caller put on
    // providerMeta.scheduledAt; sequence StepRun dispatch uses this.
    const scheduledAtRaw = payload.providerMeta?.scheduledAt;
    const scheduledAt =
      typeof scheduledAtRaw === "string" && scheduledAtRaw.length > 0
        ? scheduledAtRaw
        : undefined;

    const { data, error } = await this.client.emails.send({
      from,
      to: payload.to,
      subject: payload.subject,
      replyTo: payload.replyTo,
      cc: payload.cc,
      bcc: payload.bcc,
      ...content,
      // Send text alongside html when both are provided (improves deliverability).
      ...(payload.html && payload.text ? { text: payload.text } : {}),
      ...(attachments ? { attachments } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
    });

    if (error) {
      throw new EmailProviderError(this.name, error.message ?? "Unknown Resend error", error);
    }
    if (!data?.id) {
      throw new EmailProviderError(this.name, "Resend returned no message id.");
    }

    return { id: data.id, provider: this.name };
  }

  async cancelScheduled(messageId: string): Promise<void> {
    if (!messageId) return;
    const { error } = await this.client.emails.cancel(messageId);
    if (error) {
      // 404 / already-sent both surface as errors but aren't actionable for the
      // caller — we just want to know "this message id is no longer pending".
      // Re-throw anything else.
      const msg = (error.message ?? "").toLowerCase();
      if (msg.includes("not found") || msg.includes("already")) return;
      throw new EmailProviderError(this.name, error.message ?? "cancel failed", error);
    }
  }
}
