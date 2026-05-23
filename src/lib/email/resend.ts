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
    });

    if (error) {
      throw new EmailProviderError(this.name, error.message ?? "Unknown Resend error", error);
    }
    if (!data?.id) {
      throw new EmailProviderError(this.name, "Resend returned no message id.");
    }

    return { id: data.id, provider: this.name };
  }
}
