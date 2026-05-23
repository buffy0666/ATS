import {
  emailPayloadSchema,
  type EmailPayload,
  type EmailProvider,
  type EmailSendResult,
} from "./provider";
import { ResendProvider } from "./resend";
import { MailgunProvider } from "./mailgun";

let cached: EmailProvider | null = null;

function buildProvider(): EmailProvider {
  const name = (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase();

  switch (name) {
    case "resend": {
      const key = process.env.RESEND_API_KEY;
      if (!key) throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
      return new ResendProvider(key);
    }
    case "mailgun": {
      const key = process.env.MAILGUN_API_KEY;
      const domain = process.env.MAILGUN_DOMAIN;
      if (!key || !domain) {
        throw new Error("MAILGUN_API_KEY and MAILGUN_DOMAIN are required when EMAIL_PROVIDER=mailgun");
      }
      const region = (process.env.MAILGUN_REGION ?? "us").toLowerCase();
      if (region !== "us" && region !== "eu") {
        throw new Error("MAILGUN_REGION must be 'us' or 'eu'");
      }
      return new MailgunProvider(key, domain, region);
    }
    default:
      throw new Error(
        `Unknown EMAIL_PROVIDER: '${name}'. Supported values: resend, mailgun.`,
      );
  }
}

function getProvider(): EmailProvider {
  if (!cached) cached = buildProvider();
  return cached;
}

/**
 * Send an email through whichever provider is configured by env.
 *
 * The payload is validated with Zod, the `from` field is filled in from
 * EMAIL_FROM_DEFAULT if missing, and provider errors bubble up as
 * EmailProviderError.
 */
export async function sendEmail(input: EmailPayload): Promise<EmailSendResult> {
  const payload = emailPayloadSchema.parse(input);
  const from = payload.from ?? process.env.EMAIL_FROM_DEFAULT;
  if (!from) {
    throw new Error(
      "No 'from' address — set EMAIL_FROM_DEFAULT in .env or pass `from` to sendEmail().",
    );
  }
  return getProvider().send({ ...payload, from });
}

/** Reset the cached provider — useful in tests after changing env vars. */
export function _resetEmailProviderForTests() {
  cached = null;
}

export type { EmailPayload, EmailSendResult } from "./provider";
export { EmailProviderError } from "./provider";
