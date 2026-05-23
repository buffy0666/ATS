import { z } from "zod";

/**
 * Outbound email payload accepted by every provider.
 *
 * Keep this surface narrow on purpose — anything provider-specific
 * (Resend tags, Mailgun variables, attachments) goes through an
 * escape hatch (`providerMeta`) so callers don't have to fork per provider.
 */
export const emailPayloadSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  from: z.string().optional(),
  replyTo: z.string().email().optional(),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(998),
  html: z.string().optional(),
  text: z.string().optional(),
  /**
   * Loosely-typed bag of provider-specific options. Each provider may pick
   * out fields it understands and ignore the rest.
   */
  providerMeta: z.record(z.string(), z.unknown()).optional(),
});

export type EmailPayload = z.infer<typeof emailPayloadSchema>;

export type EmailSendResult = {
  /** Provider-issued message ID, useful for delivery tracking. */
  id: string;
  /** Which provider actually sent it (for logs). */
  provider: string;
};

export interface EmailProvider {
  /** Human-readable name, used in logs and EmailLog rows. */
  readonly name: string;
  send(payload: EmailPayload): Promise<EmailSendResult>;
  /**
   * Cancel a previously-scheduled (future-dated) send. No-ops or throws if the
   * provider doesn't support cancellation. Sequence pause/cancel uses this to
   * stop pending outbound emails.
   */
  cancelScheduled(messageId: string): Promise<void>;
}

export class EmailProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = "EmailProviderError";
  }
}
