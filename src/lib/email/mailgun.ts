import type { EmailPayload, EmailProvider, EmailSendResult } from "./provider";
import { EmailProviderError } from "./provider";

/**
 * Stub provider. Lights up when EMAIL_PROVIDER=mailgun and someone wires
 * the actual SDK call. Kept as a placeholder so the factory in index.ts
 * has somewhere to dispatch to and the abstraction surface is real.
 *
 * To finish: `npm i mailgun.js form-data` and replace `send()` with a real call.
 */
export class MailgunProvider implements EmailProvider {
  readonly name = "mailgun";

  constructor(
    _apiKey: string,
    _domain: string,
    _region: "us" | "eu" = "us",
  ) {
    // Intentionally minimal — wire up when needed.
  }

  async send(_payload: EmailPayload): Promise<EmailSendResult> {
    throw new EmailProviderError(
      this.name,
      "Mailgun provider is not implemented yet. Switch EMAIL_PROVIDER to 'resend' or finish wiring this file.",
    );
  }
}
