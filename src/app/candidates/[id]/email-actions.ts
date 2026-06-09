"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { sendEmail, systemFromAddress, EmailProviderError } from "@/lib/email";
import { sendFromUserMailbox, MailboxNotConnectedError } from "@/lib/email/mailbox";
import { makeReplyAddress } from "@/lib/email/inbound-token";

const schema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  // Nullable because FormData.get() returns null when the field is absent
  // (the "Link to a job" select only renders when the candidate has
  // applications). Coerce null/"" -> null so it's truly optional.
  applicationId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type ComposeResult =
  | { ok: true; id: string; provider: string }
  | { ok: false; error: string };

export async function sendCandidateEmail(
  candidateId: string,
  _prev: ComposeResult | undefined,
  formData: FormData,
): Promise<ComposeResult> {
  const { session, orgId } = await requireSessionWithOrg();

  const parsed = schema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
    applicationId: formData.get("applicationId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, organizationId: orgId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!candidate) {
    return { ok: false, error: "Candidate not found." };
  }

  const senderEmail = session.user.email;

  const { subject, body, applicationId } = parsed.data;
  const html = body.replace(/\n/g, "<br>");

  if (!session.user.id) {
    return { ok: false, error: "Sign in to send." };
  }

  // Replies route to the inbound-capture address when configured (captured to
  // the candidate record + forwarded back to the sender); otherwise straight
  // to the sender's own email.
  const replyTo = makeReplyAddress(candidate.id) ?? senderEmail ?? undefined;

  let sendId: string;
  let provider: string;
  let fromEmail: string | null = null;

  try {
    try {
      // Preferred: send from the recruiter's connected Gmail.
      const r = await sendFromUserMailbox(session.user.id, {
        to: candidate.email,
        subject,
        text: body,
        html,
        replyTo,
      });
      sendId = r.id;
      provider = r.provider;
      fromEmail = r.from;
    } catch (err) {
      if (!(err instanceof MailboxNotConnectedError)) throw err;
      // Fallback: no connected mailbox → send via the system (Resend) so the
      // user isn't blocked. From shows the recruiter's name over the verified
      // system address.
      const from = systemFromAddress(session.user.name);
      const r = await sendEmail({
        to: candidate.email,
        subject,
        text: body,
        html,
        replyTo,
        from,
      });
      sendId = r.id;
      provider = r.provider;
      fromEmail = from ?? process.env.EMAIL_FROM_DEFAULT ?? null;
    }

    await prisma.emailLog.create({
      data: {
        candidateId: candidate.id,
        applicationId: applicationId ?? undefined,
        fromUserId: session.user.id,
        organizationId: orgId,
        fromEmail,
        to: candidate.email,
        replyTo,
        subject,
        bodyText: body,
        bodyHtml: html,
        provider,
        providerMessageId: sendId,
        status: "SENT",
      },
    });

    revalidatePath(`/candidates/${candidate.id}`);
    return { ok: true, id: sendId, provider };
  } catch (err) {
    const errorMessage =
      err instanceof EmailProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error sending email.";

    await prisma.emailLog.create({
      data: {
        candidateId: candidate.id,
        applicationId: applicationId ?? undefined,
        fromUserId: session.user.id,
        organizationId: orgId,
        to: candidate.email,
        replyTo,
        subject,
        bodyText: body,
        bodyHtml: html,
        provider: process.env.EMAIL_PROVIDER ?? "unknown",
        status: "FAILED",
        errorMessage,
      },
    });

    return { ok: false, error: errorMessage };
  }
}
