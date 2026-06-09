"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EmailProviderError } from "@/lib/email";
import { sendFromUserMailbox, MailboxNotConnectedError } from "@/lib/email/mailbox";

const schema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(50000),
  applicationId: z.string().optional().or(z.literal("")).transform((v) => v || null),
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

  try {
    // Send from the recruiter's connected Gmail (required). Throws
    // MailboxNotConnectedError if they haven't connected one.
    const result = await sendFromUserMailbox(session.user.id, {
      to: candidate.email,
      subject,
      text: body,
      html,
      replyTo: senderEmail ?? undefined,
    });

    await prisma.emailLog.create({
      data: {
        candidateId: candidate.id,
        applicationId: applicationId ?? undefined,
        fromUserId: session.user.id,
        organizationId: orgId,
        fromEmail: result.from,
        to: candidate.email,
        replyTo: senderEmail,
        subject,
        bodyText: body,
        bodyHtml: html,
        provider: result.provider,
        providerMessageId: result.id,
        status: "SENT",
      },
    });

    revalidatePath(`/candidates/${candidate.id}`);
    return { ok: true, id: result.id, provider: result.provider };
  } catch (err) {
    if (err instanceof MailboxNotConnectedError) {
      return {
        ok: false,
        error: "Connect your Gmail in Profile to send email. (Profile → Sending email)",
      };
    }
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
        replyTo: senderEmail,
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
