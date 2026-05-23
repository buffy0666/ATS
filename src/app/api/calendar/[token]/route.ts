import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildICalendar, type ICalEvent } from "@/lib/ical";

/**
 * Personal iCal subscribe feed.
 *
 * URL: /api/calendar/<token>
 *
 * Returns all of the user's interviews where they're either the organizer or
 * an attendee. The token is regenerable from the account page; treat it like
 * a password and don't share calendar URLs publicly.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return new Response("Invalid token", { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { iCalToken: token },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return new Response("Invalid token", { status: 404 });
  }

  const interviews = await prisma.interview.findMany({
    where: {
      OR: [
        { organizerId: user.id },
        { attendees: { some: { userId: user.id } } },
      ],
    },
    include: {
      organizer: { select: { name: true, email: true } },
      candidate: { select: { firstName: true, lastName: true, email: true } },
      attendees: true,
    },
    orderBy: { startAt: "asc" },
  });

  const events: ICalEvent[] = interviews.map((iv) => ({
    uid: iv.id,
    startAt: iv.startAt,
    endAt: iv.endAt,
    title: iv.title,
    description: [
      iv.description,
      `Candidate: ${iv.candidate.firstName} ${iv.candidate.lastName} <${iv.candidate.email}>`,
      iv.videoUrl ? `Video: ${iv.videoUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    location: iv.location ?? iv.videoUrl ?? null,
    organizer: { email: iv.organizer.email, name: iv.organizer.name },
    attendees: iv.attendees.map((a) => ({ email: a.email, name: a.name, role: a.role })),
    status:
      iv.status === "CANCELED"
        ? "CANCELLED"
        : iv.status === "SCHEDULED"
          ? "CONFIRMED"
          : iv.status === "RESCHEDULED"
            ? "TENTATIVE"
            : "CONFIRMED",
    updatedAt: iv.updatedAt,
  }));

  const body = buildICalendar(events, {
    calendarName: `ATS interviews — ${user.name ?? user.email}`,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="ats-interviews.ics"',
      "Cache-Control": "no-store",
    },
  });
}
