import Link from "next/link";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { createInterview } from "../actions";
import { InterviewForm } from "../InterviewForm";
import { loadFormOptions } from "../form-data";

export default async function NewInterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ candidateId?: string; applicationId?: string }>;
}) {
  const { orgId } = await requireSessionWithOrg();
  const sp = await searchParams;

  const { candidates, teamUsers, applicationsByCandidate } = await loadFormOptions(orgId);

  const preselectedCandidate = sp.candidateId
    ? candidates.find((c) => c.id === sp.candidateId)
    : null;
  const preselectedApplication =
    sp.applicationId && preselectedCandidate
      ? applicationsByCandidate[preselectedCandidate.id]?.find((a) => a.id === sp.applicationId)
      : null;

  // Default to a 30-minute interview starting one hour from now in the user's
  // local time — the input is datetime-local, so format without a timezone.
  const now = new Date();
  const startSuggestion = new Date(now.getTime() + 60 * 60 * 1000);
  const endSuggestion = new Date(startSuggestion.getTime() + 30 * 60 * 1000);

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <Link href="/interviews" className="text-sm text-zinc-500 hover:underline">
        ← All interviews
      </Link>
      <h1 className="mt-1 text-2xl font-semibold mb-6">Schedule interview</h1>

      <InterviewForm
        action={createInterview}
        submitLabel="Schedule"
        cancelHref="/interviews"
        candidates={candidates}
        applicationsByCandidate={applicationsByCandidate}
        teamUsers={teamUsers}
        defaults={{
          candidateId: preselectedCandidate?.id,
          applicationId: preselectedApplication?.id ?? null,
          startAt: toLocalInputValue(startSuggestion),
          endAt: toLocalInputValue(endSuggestion),
        }}
      />
    </main>
  );
}

function toLocalInputValue(date: Date): string {
  // Format YYYY-MM-DDTHH:mm in local time, matching the datetime-local input.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
