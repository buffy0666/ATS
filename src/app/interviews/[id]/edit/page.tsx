import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { updateInterview } from "../../actions";
import { InterviewForm } from "../../InterviewForm";
import { loadFormOptions } from "../../form-data";

export default async function EditInterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireSessionWithOrg();
  const { id } = await params;

  const interview = await prisma.interview.findFirst({
    where: { id, organizationId: orgId },
    include: {
      attendees: {
        orderBy: { email: "asc" },
        select: { userId: true, email: true, name: true, role: true },
      },
    },
  });
  if (!interview) notFound();

  const { candidates, teamUsers, applicationsByCandidate } = await loadFormOptions(orgId);

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <Link href={`/interviews/${interview.id}`} className="text-sm text-zinc-500 hover:underline">
        ← Back to interview
      </Link>
      <h1 className="mt-1 text-2xl font-semibold mb-6">Edit interview</h1>

      <InterviewForm
        action={updateInterview.bind(null, interview.id)}
        submitLabel="Save changes"
        cancelHref={`/interviews/${interview.id}`}
        candidates={candidates}
        applicationsByCandidate={applicationsByCandidate}
        teamUsers={teamUsers}
        defaults={{
          candidateId: interview.candidateId,
          applicationId: interview.applicationId,
          title: interview.title,
          type: interview.type,
          startAt: toLocalInputValue(interview.startAt),
          endAt: toLocalInputValue(interview.endAt),
          timezone: interview.timezone,
          location: interview.location,
          videoUrl: interview.videoUrl,
          description: interview.description,
          attendees: interview.attendees.map((a) => ({
            userId: a.userId,
            email: a.email,
            name: a.name,
            role: a.role,
          })),
        }}
      />
    </main>
  );
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
