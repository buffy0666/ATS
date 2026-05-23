import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildICalendar, type ICalEvent } from "@/lib/ical";

/**
 * Returns a single interview as an .ics file for one-off "Add to calendar"
 * downloads or attaching to email invites.
 *
 * Auth: the requesting user must be the organizer, an attendee, or an admin.
 * (Candidates receive the .ics as an email attachment, not via this endpoint.)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      organizer: { select: { name: true, email: true } },
      candidate: { select: { firstName: true, lastName: true, email: true } },
      attendees: { select: { userId: true, email: true, name: true, role: true } },
    },
  });
  if (!interview) {
    return new Response("Not found", { status: 404 });
  }

  const isOrganizer = interview.organizerId === session.user.id;
  const isAttendee = interview.attendees.some((a) => a.userId === session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  if (!isOrganizer && !isAttendee && !isAdmin) {
    return new Response("Forbidden", { status: 403 });
  }

  const event: ICalEvent = {
    uid: interview.id,
    startAt: interview.startAt,
    endAt: interview.endAt,
    title: interview.title,
    description: [
      interview.description,
      `Candidate: ${interview.candidate.firstName} ${interview.candidate.lastName} <${interview.candidate.email}>`,
      interview.videoUrl ? `Video: ${interview.videoUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    location: interview.location ?? interview.videoUrl ?? null,
    organizer: { email: interview.organizer.email, name: interview.organizer.name },
    attendees: interview.attendees.map((a) => ({ email: a.email, name: a.name, role: a.role })),
    status:
      interview.status === "CANCELED"
        ? "CANCELLED"
        : interview.status === "RESCHEDULED"
          ? "TENTATIVE"
          : "CONFIRMED",
    updatedAt: interview.updatedAt,
  };

  const body = buildICalendar([event]);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="interview-${interview.id}.ics"`,
    },
  });
}
