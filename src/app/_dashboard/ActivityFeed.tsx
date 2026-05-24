import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_DOT, panelClass, relativeTime } from "./_helpers";

type ActivityType = "email" | "note" | "stage" | "interview" | "enrollment";

export type ActivityItem = {
  key: string;
  type: ActivityType;
  at: Date;
  text: string;
  detail?: string;
  href: string;
};

export type ActivityFeedData = {
  items: ActivityItem[];
};

const PER_SOURCE = 15;
const TOTAL = 20;

export async function loadActivityFeed(): Promise<ActivityFeedData> {
  const [emails, notes, stageMoves, interviews, enrollments] = await Promise.all([
    prisma.emailLog.findMany({
      orderBy: { sentAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        sentAt: true,
        subject: true,
        fromUser: { select: { name: true, email: true } },
        candidate: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    }),
    prisma.note.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        createdAt: true,
        body: true,
        author: { select: { name: true, email: true } },
        // application is now optional — notes can attach directly to a
        // candidate too. We fall through to `candidate` when it's null.
        application: {
          select: {
            candidate: { select: { id: true, firstName: true, lastName: true } },
            job: { select: { title: true } },
          },
        },
        candidate: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.application.findMany({
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        updatedAt: true,
        stage: true,
        candidate: { select: { id: true, firstName: true, lastName: true } },
        job: { select: { title: true } },
      },
    }),
    prisma.interview.findMany({
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        createdAt: true,
        type: true,
        organizer: { select: { name: true, email: true } },
        candidate: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.sequenceEnrollment.findMany({
      orderBy: { startedAt: "desc" },
      take: PER_SOURCE,
      select: {
        id: true,
        startedAt: true,
        candidate: { select: { id: true, firstName: true, lastName: true } },
        sequence: { select: { id: true, name: true } },
        enrolledBy: { select: { name: true, email: true } },
      },
    }),
  ]);

  const items: ActivityItem[] = [];

  for (const e of emails) {
    if (!e.candidate) continue;
    const who = e.fromUser?.name ?? e.fromUser?.email ?? "Someone";
    items.push({
      key: `email-${e.id}`,
      type: "email",
      at: e.sentAt,
      text: `${who} emailed ${e.candidate.firstName} ${e.candidate.lastName}`,
      detail: e.subject,
      href: `/candidates/${e.candidate.id}`,
    });
  }

  for (const n of notes) {
    const cand = n.application?.candidate ?? n.candidate;
    if (!cand) continue; // orphan note — skip in the feed
    const who = n.author?.name ?? n.author?.email ?? "Someone";
    const target = n.application
      ? `${cand.firstName} ${cand.lastName}'s ${n.application.job.title} application`
      : `${cand.firstName} ${cand.lastName}`;
    items.push({
      key: `note-${n.id}`,
      type: "note",
      at: n.createdAt,
      text: `${who} added a note on ${target}`,
      detail: n.body.slice(0, 120),
      href: `/candidates/${cand.id}`,
    });
  }

  for (const a of stageMoves) {
    items.push({
      key: `stage-${a.id}`,
      type: "stage",
      at: a.updatedAt,
      text: `${a.candidate.firstName} ${a.candidate.lastName} updated to ${a.stage.replace(
        /_/g,
        " ",
      )} on ${a.job.title}`,
      href: `/candidates/${a.candidate.id}`,
    });
  }

  for (const iv of interviews) {
    const who = iv.organizer?.name ?? iv.organizer?.email ?? "Someone";
    items.push({
      key: `interview-${iv.id}`,
      type: "interview",
      at: iv.createdAt,
      text: `${who} scheduled ${iv.type.toString().toLowerCase()} with ${iv.candidate.firstName} ${iv.candidate.lastName}`,
      href: `/candidates/${iv.candidate.id}`,
    });
  }

  for (const en of enrollments) {
    const who = en.enrolledBy?.name ?? en.enrolledBy?.email ?? "Someone";
    items.push({
      key: `enrollment-${en.id}`,
      type: "enrollment",
      at: en.startedAt,
      text: `${who} enrolled ${en.candidate.firstName} ${en.candidate.lastName} in ${en.sequence.name}`,
      href: `/sequences/${en.sequence.id}/enrollments`,
    });
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return { items: items.slice(0, TOTAL) };
}

export function ActivityFeed({ data }: { data: ActivityFeedData }) {
  return (
    <section className={panelClass}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
        Recent activity
      </h2>
      {data.items.length === 0 ? (
        <p className="text-sm text-zinc-500">No activity yet.</p>
      ) : (
        <ol className="space-y-3">
          {data.items.map((item) => (
            <li key={item.key} className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${ACTIVITY_DOT[item.type] ?? "bg-zinc-400"}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <Link href={item.href} className="hover:underline">
                    {item.text}
                  </Link>
                </div>
                {item.detail && (
                  <div className="text-xs text-zinc-500 line-clamp-1">{item.detail}</div>
                )}
              </div>
              <span className="text-xs text-zinc-500 shrink-0 mt-0.5">
                {relativeTime(item.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
