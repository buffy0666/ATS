import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EmailComposer } from "./EmailComposer";
import { EmailHistory } from "./EmailHistory";
import { NotesSection } from "./NotesSection";
import { CandidateJobsSection } from "./CandidateJobsSection";
import { CandidateQuickEdit } from "./CandidateQuickEdit";
import { CandidateNavigator } from "./CandidateNavigator";
import { DeleteCandidateButton } from "../DeleteCandidateButton";
import { OutreachInsights, type ActivityItem, type OutreachInsight } from "./OutreachInsights";
import { ResumeUploadButton } from "./ResumeUploadButton";
import { ResumeViewer } from "./ResumeViewer";
import {
  CandidateSequencesSection,
  type CandidateEnrollment,
} from "./CandidateSequencesSection";
import {
  CandidateStatus,
  CustomFieldEntity,
  EmploymentType,
  EnrollmentStatus,
  JobStatus,
  RemotePref,
  Role,
  SequenceStatus,
  StepRunStatus,
  WorkAuth,
} from "@/generated/prisma";
import { CustomFieldsView } from "@/components/custom-fields/CustomFieldsView";
import { loadCustomFields, loadCustomFieldValues } from "@/lib/custom-fields";
import { tagClass } from "@/lib/tag-colors";

const WORK_AUTH_LABEL: Record<WorkAuth, string> = {
  US_CITIZEN: "U.S. citizen",
  GREEN_CARD: "Green card",
  H1B: "H-1B",
  H1B_TRANSFER: "H-1B transfer",
  OPT: "OPT",
  STEM_OPT: "STEM OPT",
  CPT: "CPT",
  TN: "TN",
  L1: "L-1",
  L2: "L-2",
  E3: "E-3",
  O1: "O-1",
  OTHER_VISA: "Other visa",
  NEEDS_SPONSORSHIP: "Needs sponsorship",
  NOT_AUTHORIZED: "Not authorized to work",
};

const SENIORITY_LABEL: Record<string, string> = {
  INTERN: "Intern",
  ENTRY: "Entry",
  JUNIOR: "Junior",
  MID: "Mid",
  SENIOR: "Senior",
  STAFF: "Staff",
  PRINCIPAL: "Principal",
  LEAD: "Lead",
  MANAGER: "Manager",
  SENIOR_MANAGER: "Senior manager",
  DIRECTOR: "Director",
  VP: "VP",
  C_LEVEL: "C-level",
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  CONTRACT_TO_HIRE: "Contract-to-hire",
  TEMPORARY: "Temporary",
  INTERNSHIP: "Internship",
  FREELANCE: "Freelance",
};

const REMOTE_PREF_LABEL: Record<RemotePref, string> = {
  ONSITE: "Onsite",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
};

const SOURCE_LABEL: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  REFERRAL: "Referral",
  JOB_BOARD: "Job board",
  AGENCY: "Agency",
  INBOUND: "Inbound",
  OUTBOUND: "Outbound",
  CAREER_SITE: "Career site",
  EVENT: "Event",
  RECRUITER_NETWORK: "Recruiter network",
  OTHER: "Other",
};

const STATUS_LABEL: Record<CandidateStatus, string> = {
  ACTIVE: "Active",
  PASSIVE: "Passive",
  PLACED: "Placed",
  ON_HOLD: "On hold",
  DO_NOT_CONTACT: "Do not contact",
  ALUMNI: "Alumni",
  BLACKLISTED: "Blacklisted",
};

const STATUS_BADGE: Record<CandidateStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  PASSIVE: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  PLACED: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  ON_HOLD: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  DO_NOT_CONTACT: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  ALUMNI: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  BLACKLISTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, orgId } = await requireSessionWithOrg();

  const [
    candidate,
    notes,
    templates,
    candidateEnrollments,
    availableSequences,
    customFields,
    customFieldValues,
    openJobs,
  ] = await Promise.all([
    // findFirst (not findUnique) so we can compose id + organizationId in
    // the where clause — prevents cross-tenant reads if someone guesses
    // a candidate cuid.
    prisma.candidate.findFirst({
      where: { id, organizationId: orgId },
      include: {
        applications: {
          include: { job: true },
          orderBy: { createdAt: "desc" },
        },
        emails: {
          orderBy: { sentAt: "desc" },
          include: {
            fromUser: { select: { name: true, email: true } },
            application: { select: { job: { select: { title: true } } } },
          },
        },
        tags: true,
        sourcedBy: { select: { id: true, name: true, email: true } },
        referredByUser: { select: { id: true, name: true, email: true } },
        referredByContact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.note.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { candidateId: id },
          { application: { candidateId: id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { name: true, email: true } },
        application: {
          select: {
            id: true,
            stage: true,
            job: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.emailTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, body: true },
    }),
    prisma.sequenceEnrollment.findMany({
      // sequenceEnrollment is scoped via its candidate; the explicit
      // candidateId filter already provides tenant isolation. Phase 6
      // adds direct organizationId once SequenceEnrollment carries it.
      where: { candidateId: id, candidate: { organizationId: orgId } },
      orderBy: { startedAt: "desc" },
      include: {
        sequence: { select: { id: true, name: true } },
        stepRuns: {
          select: { id: true, status: true, scheduledFor: true },
          orderBy: { scheduledFor: "asc" },
        },
      },
    }),
    prisma.sequence.findMany({
      where: { status: SequenceStatus.ACTIVE, organizationId: orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    loadCustomFields(CustomFieldEntity.CANDIDATE, orgId),
    loadCustomFieldValues(CustomFieldEntity.CANDIDATE, id, orgId),
    // For the "add to another job" picker — only OPEN jobs the recruiter
    // can realistically place candidates on, scoped to this org. Includes
    // the client so the picker can filter "by client first, then job".
    // Already-assigned jobs are filtered out client-side after the
    // candidate's applications load.
    prisma.job.findMany({
      where: { status: JobStatus.OPEN, organizationId: orgId },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        client: { select: { id: true, name: true } },
      },
    }),
  ]);

  if (!candidate) notFound();

  const senderName = session?.user?.name ?? session?.user?.email ?? "ATS";

  const displayLocation = [candidate.locationCity, candidate.locationState, candidate.locationCountry]
    .filter(Boolean)
    .join(", ");

  const formatSalary = (n: number | null) =>
    n == null ? null : `${candidate.salaryCurrency} ${n.toLocaleString()}`;

  const desiredSalary =
    candidate.desiredSalaryMin || candidate.desiredSalaryMax
      ? `${formatSalary(candidate.desiredSalaryMin) ?? "?"} – ${formatSalary(candidate.desiredSalaryMax) ?? "?"}`
      : null;

  const enrollmentsForUI: CandidateEnrollment[] = candidateEnrollments.map((e) => {
    const total = e.stepRuns.length;
    const completed = e.stepRuns.filter((r) => r.status === StepRunStatus.COMPLETED).length;
    const next = e.stepRuns.find((r) => r.status === StepRunStatus.PENDING);
    return {
      id: e.id,
      status: e.status,
      startedAt: e.startedAt,
      sequence: e.sequence,
      totalSteps: total,
      completedSteps: completed,
      nextScheduledFor: next?.scheduledFor ?? null,
    };
  });

  const activeEnrollmentIds = new Set(
    candidateEnrollments
      .filter((e) => e.status === EnrollmentStatus.ACTIVE || e.status === EnrollmentStatus.PAUSED)
      .map((e) => e.sequence.id),
  );
  const enrollableSequences = availableSequences.filter((s) => !activeEnrollmentIds.has(s.id));

  return (
    <main className="flex-1 max-w-[120rem] mx-auto w-full px-6 py-4">
      {/* Header — name, status, summary stay above the workspace */}
      <header className="shrink-0 mb-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/candidates" className="text-xs text-zinc-500 hover:underline">
            ← All candidates
          </Link>
          <div className="flex items-center gap-2">
            <CandidateNavigator currentId={candidate.id} />
            <DeleteCandidateButton
              candidateId={candidate.id}
              candidateName={`${candidate.firstName} ${candidate.lastName}`}
              applicationCount={candidate.applications.length}
            />
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold">
            {candidate.firstName} {candidate.lastName}
            {candidate.preferredName && (
              <span className="ml-2 text-base font-normal text-zinc-500">
                &ldquo;{candidate.preferredName}&rdquo;
              </span>
            )}
          </h1>
          {candidate.pronouns && (
            <span className="text-sm text-zinc-500">({candidate.pronouns})</span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${STATUS_BADGE[candidate.status]}`}
          >
            {STATUS_LABEL[candidate.status]}
          </span>
          {candidate.rating != null && (
            <span className="text-sm text-amber-600 dark:text-amber-400">
              {"★".repeat(candidate.rating)}
              <span className="text-zinc-400">{"★".repeat(Math.max(0, 5 - candidate.rating))}</span>
            </span>
          )}
          {(candidate.currentTitle || candidate.currentCompany) && (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              · {candidate.currentTitle}
              {candidate.currentTitle && candidate.currentCompany && " at "}
              {candidate.currentCompany}
            </span>
          )}
          <span className="text-sm text-zinc-500 break-all">· {candidate.email}</span>
          {candidate.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {candidate.tags.map((t) => (
                <span
                  key={t.id}
                  className={`rounded-full px-2 py-0.5 text-xs ${tagClass(t.color)}`}
                >
                  {t.name}
                </span>
              ))}
            </div>
          )}
          <div className="ml-auto">
            <ResumeUploadButton
              candidateId={candidate.id}
              hasExistingResume={Boolean(candidate.resumeUrl)}
            />
          </div>
        </div>
      </header>

      {/* Page-wide grid: left column carries the long stuff (resume,
          metadata, sequences, communication); right column is a sticky
          Notes sidebar that follows the user as they scroll through
          everything else. Notes uses `align-self: start` so it doesn't
          stretch to the height of the left column — sticky positioning
          works inside its grid cell up to the bottom of the row. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 mb-4 items-start">
        {/* Left column: resume + everything else, stacked. */}
        <div className="space-y-4 min-w-0">
          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <ResumeViewer
              data={{
                resumeUrl: candidate.resumeUrl,
                resumeText: candidate.resumeText,
                linkedinPageText: candidate.linkedinPageText,
                summary: candidate.summary,
                skills: candidate.skills,
                workHistory: (candidate.workHistory ?? []) as never,
                education: (candidate.education ?? []) as never,
                recentActivity: (candidate.recentActivity ?? []) as never,
                firstName: candidate.firstName,
                lastName: candidate.lastName,
                email: candidate.email,
                phone: candidate.phone,
                linkedinUrl: candidate.linkedinUrl,
                locationCity: candidate.locationCity,
                locationState: candidate.locationState,
                locationCountry: candidate.locationCountry,
                // Extras that ResumeViewerTabs reads through a cast — keeps
                // CandidateResumeData lean while still piping AI status
                // through.
                ...({
                  aiResumeFacsimile: candidate.aiResumeFacsimile,
                  aiStatus: candidate.aiStatus,
                  aiError: candidate.aiError,
                } as Record<string, unknown>),
              }}
              emailSlot={
                <>
                  <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Communication ({candidate.emails.length})
                  </div>
                  <div className="mb-4">
                    <EmailComposer
                      candidateId={candidate.id}
                      candidateEmail={candidate.email}
                      candidateFirstName={candidate.firstName}
                      candidateLastName={candidate.lastName}
                      candidatePhone={candidate.phone}
                      senderName={senderName}
                      senderEmail={session?.user?.email ?? ""}
                      applications={candidate.applications.map((a) => ({
                        id: a.id,
                        jobTitle: a.job.title,
                      }))}
                      templates={templates}
                    />
                  </div>
                  <EmailHistory emails={candidate.emails} />
                </>
              }
            />
          </section>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Profile
            </div>
            <div className="p-5">
          {candidate.summary && (
            <p className="mb-5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {candidate.summary}
            </p>
          )}

          <div className="mb-6 border-b border-zinc-200 dark:border-zinc-800 pb-5">
            <CandidateQuickEdit
              candidate={{
                id: candidate.id,
                workAuthorization: candidate.workAuthorization,
                requiresSponsorship: candidate.requiresSponsorship,
                githubUrl: candidate.githubUrl,
                portfolioUrl: candidate.portfolioUrl,
                employmentTypePref: candidate.employmentTypePref,
                remotePref: candidate.remotePref,
              }}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-6">
            {/* Left column */}
            <div className="space-y-6 min-w-0">
              <CandidateJobsSection
                candidateId={candidate.id}
                applications={candidate.applications.map((a) => ({
                  id: a.id,
                  jobId: a.job.id,
                  jobTitle: a.job.title,
                  stage: a.stage,
                }))}
                availableJobs={openJobs
                  .filter((j) => !candidate.applications.some((a) => a.job.id === j.id))
                  .map((j) => ({
                    id: j.id,
                    title: j.title,
                    clientId: j.client?.id ?? null,
                    clientName: j.client?.name ?? null,
                  }))}
              />

              <DetailGrid title="Contact">
                <Detail label="Email" value={candidate.email} />
                <Detail label="Alternate email" value={candidate.alternateEmail} />
                <Detail label="Phone" value={candidate.phone} />
                <Detail label="Alternate phone" value={candidate.alternatePhone} />
              </DetailGrid>

              <DetailGrid title="Location & work authorization">
                <Detail label="Location" value={displayLocation || null} />
                <Detail label="Timezone" value={candidate.timezone} />
                <Detail
                  label="Open to relocation"
                  value={candidate.willingToRelocate ? "Yes" : "No"}
                />
                <Detail
                  label="Work authorization"
                  value={candidate.workAuthorization ? WORK_AUTH_LABEL[candidate.workAuthorization] : null}
                />
                <Detail
                  label="Requires sponsorship"
                  value={candidate.requiresSponsorship ? "Yes" : "No"}
                />
              </DetailGrid>

              <DetailGrid title="Career">
                <Detail label="Current title" value={candidate.currentTitle} />
                <Detail label="Current company" value={candidate.currentCompany} />
                <Detail
                  label="Years of experience"
                  value={candidate.yearsExperience != null ? String(candidate.yearsExperience) : null}
                />
                <Detail
                  label="Seniority"
                  value={candidate.seniority ? (SENIORITY_LABEL[candidate.seniority] ?? candidate.seniority) : null}
                />
              </DetailGrid>

              <DetailGrid title="Compensation & availability">
                <Detail label="Desired salary" value={desiredSalary} />
                <Detail label="Current salary" value={formatSalary(candidate.currentSalary)} />
                <Detail
                  label="Available from"
                  value={candidate.availableFrom ? candidate.availableFrom.toLocaleDateString() : null}
                />
                <Detail
                  label="Notice period"
                  value={candidate.noticePeriodDays != null ? `${candidate.noticePeriodDays} days` : null}
                />
                <Detail
                  label="Employment type"
                  value={
                    candidate.employmentTypePref.length > 0
                      ? candidate.employmentTypePref.map((e) => EMPLOYMENT_TYPE_LABEL[e]).join(", ")
                      : null
                  }
                />
                <Detail
                  label="Work mode"
                  value={
                    candidate.remotePref.length > 0
                      ? candidate.remotePref.map((r) => REMOTE_PREF_LABEL[r]).join(", ")
                      : null
                  }
                />
              </DetailGrid>
            </div>

            {/* Right column */}
            <div className="space-y-6 min-w-0">
              {(candidate.industries.length > 0 || candidate.specialties.length > 0) && (
                <DetailGrid title="Focus">
                  <Detail
                    label="Industries"
                    value={candidate.industries.length > 0 ? candidate.industries.join(", ") : null}
                  />
                  <Detail
                    label="Specialties"
                    value={candidate.specialties.length > 0 ? candidate.specialties.join(", ") : null}
                  />
                </DetailGrid>
              )}

              <DetailGrid title="Links">
                <Detail label="LinkedIn" value={linkOrNull(candidate.linkedinUrl)} />
                <Detail label="GitHub" value={linkOrNull(candidate.githubUrl)} />
                <Detail label="Portfolio" value={linkOrNull(candidate.portfolioUrl)} />
                <Detail
                  label="Resume"
                  value={
                    candidate.resumeUrl ? (
                      <a
                        href={candidate.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Download
                      </a>
                    ) : null
                  }
                />
                {candidate.otherUrls.length > 0 && (
                  <Detail
                    label="Other URLs"
                    value={
                      <ul className="space-y-0.5">
                        {candidate.otherUrls.map((u) => (
                          <li key={u}>
                            <a
                              href={u}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline break-all"
                            >
                              {u}
                            </a>
                          </li>
                        ))}
                      </ul>
                    }
                  />
                )}
              </DetailGrid>

              <DetailGrid title="Source & ownership">
                <Detail
                  label="Source"
                  value={candidate.source ? (SOURCE_LABEL[candidate.source] ?? candidate.source) : null}
                />
                <Detail label="Source detail" value={candidate.sourceDetail} />
                <Detail
                  label="Sourced by"
                  value={
                    candidate.sourcedBy ? candidate.sourcedBy.name ?? candidate.sourcedBy.email : null
                  }
                />
                <Detail
                  label="Referred by"
                  value={
                    candidate.referredByUser
                      ? candidate.referredByUser.name ?? candidate.referredByUser.email
                      : candidate.referredByContact ? (
                          <Link
                            href={`/clients/${candidate.referredByContact.client.id}`}
                            className="underline"
                          >
                            {candidate.referredByContact.firstName} {candidate.referredByContact.lastName} ({candidate.referredByContact.client.name})
                          </Link>
                        )
                      : candidate.referredByName ?? null
                  }
                />
                <Detail
                  label="Last contacted"
                  value={
                    candidate.lastContactedAt ? candidate.lastContactedAt.toLocaleString() : null
                  }
                />
                <Detail
                  label="Next follow-up"
                  value={
                    candidate.nextFollowUpAt ? candidate.nextFollowUpAt.toLocaleDateString() : null
                  }
                />
                <Detail
                  label="Email subscription"
                  value={candidate.unsubscribedAt ? "Unsubscribed" : "Subscribed"}
                />
                <Detail label="Added" value={candidate.createdAt.toLocaleDateString()} />
              </DetailGrid>

              {candidate.skills.length > 0 && (
                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Skills
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.skills.map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {candidate.notes && (
                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Candidate notes (legacy)
                  </h2>
                  <p className="whitespace-pre-wrap text-sm">{candidate.notes}</p>
                </section>
              )}

              <CustomFieldsView fields={customFields} values={customFieldValues} />
            </div>
          </div>
        </div>
      </section>

          {/* Outreach personalization — AI-extracted hooks + raw activity */}
          {(candidate.recentActivity || candidate.outreachInsights) && (
            <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 flex items-center justify-between gap-2">
                <span>Outreach personalization</span>
                {candidate.aiStatus === "PENDING" && (
                  <span className="text-[10px] font-normal text-zinc-400 normal-case">
                    AI processing queued…
                  </span>
                )}
                {candidate.aiStatus === "PROCESSING" && (
                  <span className="text-[10px] font-normal text-amber-600 normal-case">
                    AI processing now…
                  </span>
                )}
                {candidate.aiStatus === "READY" && (
                  <span className="text-[10px] font-normal text-emerald-600 normal-case">
                    AI processing complete
                  </span>
                )}
              </div>
              <div className="p-5">
                <OutreachInsights
                  insights={(candidate.outreachInsights ?? []) as OutreachInsight[]}
                  activity={(candidate.recentActivity ?? []) as ActivityItem[]}
                />
              </div>
            </section>
          )}

          {/* Sequences — full width inside left column */}
          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <CandidateSequencesSection
              candidateId={candidate.id}
              enrollments={enrollmentsForUI}
              availableSequences={enrollableSequences}
              applications={candidate.applications.map((a) => ({
                id: a.id,
                jobTitle: a.job.title,
              }))}
            />
          </section>

          {/* Email composer + history now live in the "Email" tab of the
              ResumeViewer panel above (tab position 1). */}
        </div>

        {/* Right column: sticky Notes sidebar. `sticky top-4` keeps the
            compose box pinned to the viewport as the user scrolls through
            the left column. `self-start` lets the sidebar stay at its
            natural height instead of stretching to match the (much taller)
            left column. */}
        <aside
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-hidden sticky top-4 self-start"
          style={{ maxHeight: "calc(100vh - 2rem)" }}
        >
          <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Notes
          </div>
          <div className="flex-1 min-h-0 p-5">
            <NotesSection
              candidateId={candidate.id}
              notes={notes}
              applications={candidate.applications.map((a) => ({
                id: a.id,
                jobTitle: a.job.title,
                stage: a.stage,
              }))}
              currentUserId={session?.user?.id ?? ""}
              currentUserIsAdmin={session?.user?.role === Role.ADMIN}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

function DetailGrid({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-sm break-words">{value || <span className="text-zinc-400">—</span>}</div>
    </div>
  );
}

function linkOrNull(url: string | null): React.ReactNode {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline">
      {url}
    </a>
  );
}
