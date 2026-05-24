import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail, EmailProviderError } from "@/lib/email";
import { renderTemplate } from "@/lib/template-renderer";
import { EmailStatus } from "@/generated/prisma";
import { defineTool } from "./types";

export const emailCandidateTool = defineTool({
  name: "email_candidate",
  description:
    "Send an email to a candidate right now (no scheduling). Subject and body support {{candidate.firstName}}, {{candidate.lastName}}, {{sender.name}}, {{sender.email}} placeholders. Always confirm with the user in chat before invoking this — it actually sends.",
  requiresAdmin: false,
  parameters: z.object({
    candidateId: z.string().min(1).max(40),
    subject: z.string().min(1).max(998),
    body: z
      .string()
      .min(1)
      .max(20000)
      .describe("Plain text body. Newlines are preserved and converted to <br> for the HTML part."),
    replyTo: z
      .string()
      .email()
      .optional()
      .describe("Reply-To header. Defaults to the sender's email."),
  }),
  async execute(args, ctx) {
    const [candidate, sender] = await Promise.all([
      prisma.candidate.findUnique({
        where: { id: args.candidateId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!candidate) return { ok: false, error: "Candidate not found." };
    if (!sender) return { ok: false, error: "Sender not found." };

    const tplCtx: Record<string, string> = {
      "candidate.firstName": candidate.firstName,
      "candidate.lastName": candidate.lastName,
      "candidate.email": candidate.email,
      "candidate.phone": candidate.phone ?? "",
      "sender.name": sender.name ?? "",
      "sender.email": sender.email,
    };
    const subject = renderTemplate(args.subject, tplCtx);
    const text = renderTemplate(args.body, tplCtx);
    const html = text.replace(/\n/g, "<br>");

    try {
      const result = await sendEmail({
        to: candidate.email,
        subject,
        text,
        html,
        replyTo: args.replyTo ?? sender.email,
      });
      const log = await prisma.emailLog.create({
        data: {
          candidateId: candidate.id,
          fromUserId: sender.id,
          to: candidate.email,
          subject,
          bodyText: text,
          bodyHtml: html,
          provider: result.provider,
          providerMessageId: result.id,
          status: EmailStatus.SENT,
        },
        select: { id: true },
      });
      return {
        ok: true,
        emailLogId: log.id,
        providerMessageId: result.id,
        to: candidate.email,
        subject,
      };
    } catch (error) {
      const message =
        error instanceof EmailProviderError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown send error";
      await prisma.emailLog.create({
        data: {
          candidateId: candidate.id,
          fromUserId: sender.id,
          to: candidate.email,
          subject,
          bodyText: text,
          bodyHtml: html,
          provider: "unknown",
          status: EmailStatus.FAILED,
          errorMessage: message,
        },
      });
      return { ok: false, error: message };
    }
  },
});
