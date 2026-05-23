"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth-utils";
import { sendEmail, EmailProviderError } from "@/lib/email";

const schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1),
});

export type SendResult =
  | { ok: true; id: string; provider: string }
  | { ok: false; error: string };

export async function sendTestEmail(
  _prev: SendResult | undefined,
  formData: FormData,
): Promise<SendResult> {
  await requireAdmin();

  const parsed = schema.safeParse({
    to: formData.get("to"),
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const result = await sendEmail({
      to: parsed.data.to,
      subject: parsed.data.subject,
      text: parsed.data.body,
      html: parsed.data.body.replace(/\n/g, "<br>"),
    });
    return { ok: true, id: result.id, provider: result.provider };
  } catch (err) {
    if (err instanceof EmailProviderError) return { ok: false, error: err.message };
    if (err instanceof Error) return { ok: false, error: err.message };
    return { ok: false, error: "Unknown error sending email." };
  }
}
