import Link from "next/link";
import { notFound } from "next/navigation";
import { InterviewStatus, InterviewType } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { DeleteInterviewButton } from "./DeleteInterviewButton";
import { InterviewStatusSelect } from "./InterviewStatusSelect";

const TYPE_LABEL: Record<InterviewType, string> = {
  PHONE_SCREEN: "Phone screen",
  TECHNICAL: "Technical",
  ONSITE: "Onsite",
  FINAL: "Final",
  CULTURE_FIT: "Culture fit",
  OTHER: "Other",
};

const STATUS_BADGE: Record<InterviewStatus, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  CANCELED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  NO_SHOW: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  RESCHEDULED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireSessionWithOrg();
  const { id } = await params;

  const interview = await prisma.interview.findFirst({
    where: { id, organizationId: orgId },
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      organizer: { select: { id: true, name: true, email: true } },
      attendees: {
        orderBy: { email: "asc" },
        select: { id: true, email: true, name: true, role: true, userId: true },
      },
      application: {
        select: {
          id: true,
          stage: true,
          job: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!interview) notFound();

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <Link href="/interviews" className="text-sm text-zinc-500 hover:underline">
            ← All interviews
          </Link>
          <h1 className="mt-1 text-2xl font-semibold flex items-center gap-3 flex-wrap">
            <span>{interview.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[interview.status]}`}
            >
              {interview.status.replace(/_/g, " ")}
            </span>
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {TYPE_LABEL[interview.type]} · organized by{" "}
            {interview.organizer.name ?? interview.organizer.email}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/interviews/${interview.id}/edit`}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Edit
            </Link>
            <a
              href={`/api/interviews/${interview.id}/ics`}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Download .ics
            </a>
          </div>
          <InterviewStatusSelect
            interviewId={interview.id}
            currentStatus={interview.status}
          />
          <DeleteInterviewButton
            interviewId={interview.id}
            interviewTitle={interview.title}
          />
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          When &amp; where
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field
            label="Start"
            value={`${interview.startAt.toLocaleString()}${
              interview.timezone ? ` (${interview.timezone})` : ""
            }`}
          />
          <Field
            label="End"
            value={`${interview.endAt.toLocaleString()}${
              interview.timezone ? ` (${interview.timezone})` : ""
            }`}
          />
          <Field label="Location" value={interview.location ?? "—"} />
          <Field
            label="Video link"
            value={
              interview.videoUrl ? (
                <a
                  href={interview.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline break-all"
                >
                  {interview.videoUrl}
                </a>
              ) : (
                "—"
              )
            }
          />
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Candidate
        </h2>
        <Link
          href={`/candidates/${interview.candidate.id}`}
          className="font-medium hover:underline"
        >
          {interview.candidate.firstName} {interview.candidate.lastName}
        </Link>
        <div className="text-sm text-zinc-500">{interview.candidate.email}</div>

        {interview.application && (
          <div className="mt-3 text-sm">
            <span className="text-zinc-500">For job:</span>{" "}
            <Link
              href={`/jobs/${interview.application.job.id}`}
              className="hover:underline font-medium"
            >
              {interview.application.job.title}
            </Link>{" "}
            <span className="ml-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
              {interview.application.stage.replace(/_/g, " ")}
            </span>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Attendees ({interview.attendees.length})
        </h2>
        {interview.attendees.length === 0 ? (
          <p className="text-sm text-zinc-500">No additional attendees.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {interview.attendees.map((a) => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.name ?? a.email}</div>
                  {a.name && <div className="text-xs text-zinc-500">{a.email}</div>}
                </div>
                {a.role && (
                  <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
                    {a.role}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {interview.description && (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
            Description
          </h2>
          <p className="whitespace-pre-wrap text-sm">{interview.description}</p>
        </section>
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500 mb-0.5">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
