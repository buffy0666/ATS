"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auditCreate, auditDelete } from "@/lib/audit/write";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { InterviewStatus, InterviewType } from "@/generated/prisma";
import { sendEmail } from "@/lib/email";
import { buildICalendar, type ICalEvent } from "@/lib/ical";

const attendeeSchema = z.object({
  userId: z
    .string()
    .optional()
    .transform((v) => v || null),
  email: z.string().email(),
  name: z.string().max(160).optional().or(z.literal("")).transform((v) => v || null),
  role: z.string().max(60).optional().or(z.literal("")).transform((v) => v || null),
});

const interviewSchema = z.object({
  candidateId: z.string().min(1),
  applicationId: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => v || null),
  title: z.string().min(1).max(200),
  type: z.nativeEnum(InterviewType),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  timezone: z.string().max(60).optional().or(z.literal("")).transform((v) => v || null),
  location: z.string().max(200).optional().or(z.literal("")).transform((v) => v || null),
  videoUrl: z.string().max(500).optional().or(z.literal("")).transform((v) => v || null),
  description: z.string().max(5000).optional().or(z.literal("")).transform((v) => v || null),
  attendees: z.array(attendeeSchema).default([]),
  sendInvites: z.boolean().default(true),
});

type InterviewInput = z.infer<typeof interviewSchema>;

function parseAttendees(formData: FormData): InterviewInput["attendees"] {
  // Form sends parallel arrays: attendeeEmail[], attendeeName[], attendeeRole[], attendeeUserId[]
  const emails = formData.getAll("attendeeEmail").map(String);
  const names = formData.getAll("attendeeName").map(String);
  const roles = formData.getAll("attendeeRole").map(String);
  const userIds = formData.getAll("attendeeUserId").map(String);
  const out: InterviewInput["attendees"] = [];
  for (let i = 0; i < emails.length; i++) {
    if (!emails[i]?.trim()) continue;
    out.push({
      email: emails[i].trim(),
      name: names[i] ?? "",
      role: roles[i] ?? "",
      userId: userIds[i] || "",
    });
  }
  return out;
}

export async function createInterview(formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();

  const data = interviewSchema.parse({
    candidateId: formData.get("candidateId"),
    applicationId: formData.get("applicationId"),
    title: formData.get("title"),
    type: formData.get("type"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    timezone: formData.get("timezone"),
    location: formData.get("location"),
    videoUrl: formData.get("videoUrl"),
    description: formData.get("description"),
    attendees: parseAttendees(formData),
    sendInvites: formData.get("sendInvites") === "on",
  });

  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error("Invalid start/end time.");
  }
  if (endAt <= startAt) {
    throw new Error("End time must be after start time.");
  }

  // Verify the candidate (and application, if linked) belong to this org.
  const candidate = await prisma.candidate.findFirst({
    where: { id: data.candidateId, organizationId: orgId },
    select: { id: true },
  });
  if (!candidate) throw new Error("Candidate not found.");
  if (data.applicationId) {
    const app = await prisma.application.findFirst({
      where: { id: data.applicationId, organizationId: orgId, candidateId: data.candidateId },
      select: { id: true },
    });
    if (!app) data.applicationId = null;
  }

  const interview = await prisma.interview.create({
    data: {
      candidateId: data.candidateId,
      applicationId: data.applicationId,
      title: data.title,
      type: data.type,
      startAt,
      endAt,
      timezone: data.timezone,
      location: data.location,
      videoUrl: data.videoUrl,
      description: data.description,
      organizerId: session.user.id,
      organizationId: orgId,
      attendees: {
        create: data.attendees.map((a) => ({
          userId: a.userId,
          email: a.email,
          name: a.name,
          role: a.role,
        })),
      },
    },
    include: {
      candidate: { select: { firstName: true, lastName: true, email: true } },
      attendees: true,
      organizer: { select: { name: true, email: true } },
    },
  });
  await auditCreate("Interview", interview as unknown as Record<string, unknown>);

  if (data.sendInvites) {
    await sendInviteEmails(interview, session.user);
  }

  revalidatePath("/interviews");
  revalidatePath(`/candidates/${data.candidateId}`);
  if (data.applicationId) revalidatePath(`/jobs`);
  redirect(`/interviews/${interview.id}`);
}

export async function updateInterview(interviewId: string, formData: FormData) {
  const { session, orgId } = await requireSessionWithOrg();
  const existing = await prisma.interview.findFirst({
    where: { id: interviewId, organizationId: orgId },
    select: { id: true },
  });
  if (!existing) throw new Error("Interview not found.");

  const data = interviewSchema.parse({
    candidateId: formData.get("candidateId"),
    applicationId: formData.get("applicationId"),
    title: formData.get("title"),
    type: formData.get("type"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    timezone: formData.get("timezone"),
    location: formData.get("location"),
    videoUrl: formData.get("videoUrl"),
    description: formData.get("description"),
    attendees: parseAttendees(formData),
    sendInvites: formData.get("sendInvites") === "on",
  });

  const startAt = new Date(data.startAt);
  const endAt = new Date(data.endAt);

  await prisma.$transaction(async (tx) => {
    await tx.interview.update({
      where: { id: interviewId },
      data: {
        title: data.title,
        type: data.type,
        startAt,
        endAt,
        timezone: data.timezone,
        location: data.location,
        videoUrl: data.videoUrl,
        description: data.description,
        applicationId: data.applicationId,
      },
    });
    await tx.interviewAttendee.deleteMany({ where: { interviewId } });
    await tx.interviewAttendee.createMany({
      data: data.attendees.map((a) => ({
        interviewId,
        userId: a.userId,
        email: a.email,
        name: a.name,
        role: a.role,
      })),
    });
  });

  if (data.sendInvites) {
    const fresh = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: {
        candidate: { select: { firstName: true, lastName: true, email: true } },
        attendees: true,
        organizer: { select: { name: true, email: true } },
      },
    });
    if (fresh) await sendInviteEmails(fresh, session.user, true);
  }

  revalidatePath("/interviews");
  revalidatePath(`/interviews/${interviewId}`);
  redirect(`/interviews/${interviewId}`);
}

export async function setInterviewStatus(interviewId: string, status: InterviewStatus) {
  const { orgId } = await requireSessionWithOrg();
  await prisma.interview.updateMany({
    where: { id: interviewId, organizationId: orgId },
    data: { status },
  });
  revalidatePath("/interviews");
  revalidatePath(`/interviews/${interviewId}`);
}

export async function deleteInterview(interviewId: string) {
  const { orgId } = await requireSessionWithOrg();
  const iv = await prisma.interview.findFirst({
    where: { id: interviewId, organizationId: orgId },
  });
  if (!iv) throw new Error("Interview not found.");
  await prisma.interview.delete({ where: { id: interviewId } });
  await auditDelete("Interview", iv as unknown as Record<string, unknown>);
  revalidatePath("/interviews");
  revalidatePath(`/candidates/${iv.candidateId}`);
  redirect("/interviews");
}

type InterviewForEmail = {
  id: string;
  organizationId: string | null;
  title: string;
  startAt: Date;
  endAt: Date;
  description: string | null;
  location: string | null;
  videoUrl: string | null;
  updatedAt: Date;
  candidate: { firstName: string; lastName: string; email: string };
  organizer: { name: string | null; email: string };
  attendees: { email: string; name: string | null; role: string | null; userId: string | null }[];
};

async function sendInviteEmails(
  interview: InterviewForEmail,
  sender: { id: string; email: string; name?: string | null },
  isUpdate: boolean = false,
) {
  // Build ICS body and base64-encode it for the email attachment.
  const event: ICalEvent = {
    uid: interview.id,
    startAt: interview.startAt,
    endAt: interview.endAt,
    title: interview.title,
    description: interview.description ?? undefined,
    location: interview.location ?? interview.videoUrl ?? undefined,
    organizer: { email: interview.organizer.email, name: interview.organizer.name },
    attendees: interview.attendees.map((a) => ({ email: a.email, name: a.name, role: a.role })),
    status: "CONFIRMED",
    updatedAt: interview.updatedAt,
  };
  const icsBody = buildICalendar([event]);
  const icsBase64 = Buffer.from(icsBody, "utf-8").toString("base64");

  const subject = `${isUpdate ? "Updated: " : ""}${interview.title}`;
  const when = `${interview.startAt.toUTCString()} – ${interview.endAt.toUTCString()} (UTC)`;
  const detail = [
    `When: ${when}`,
    interview.location ? `Where: ${interview.location}` : null,
    interview.videoUrl ? `Video: ${interview.videoUrl}` : null,
    interview.description ? `\n${interview.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const text = `Hi,\n\nYou're scheduled for an interview:\n\n${detail}\n\nAttached: calendar invite (.ics).\n\n— ${sender.name ?? sender.email}`;
  const html = text.replace(/\n/g, "<br>");

  // Send one email per attendee (avoids cross-recipient address leakage; some
  // attendees are internal users, others are the candidate or externals).
  const recipients = new Set<string>();
  recipients.add(interview.candidate.email);
  for (const a of interview.attendees) recipients.add(a.email);

  for (const to of recipients) {
    try {
      await sendEmail({
        to,
        subject,
        text,
        html,
        replyTo: sender.email,
        providerMeta: {
          attachments: [
            { filename: "invite.ics", content: icsBase64, contentType: "text/calendar" },
          ],
        },
      }, { orgId: interview.organizationId });
    } catch (err) {
      // Log to EmailLog as a failed send so the recruiter sees what happened.
      const message = err instanceof Error ? err.message : "Unknown error sending invite";
      // Pull the organizer's org for the log; sendInviteEmails doesn't have
      // orgId in scope so we look it up here. Cheap lookup, only on failure.
      const senderRow = await prisma.user.findUnique({
        where: { id: sender.id },
        select: { organizationId: true },
      });
      await prisma.emailLog.create({
        data: {
          fromUserId: sender.id,
          organizationId: senderRow?.organizationId ?? null,
          to,
          replyTo: sender.email,
          subject,
          bodyText: text,
          bodyHtml: html,
          provider: process.env.EMAIL_PROVIDER ?? "unknown",
          status: "FAILED",
          errorMessage: message,
        },
      });
    }
  }
}
