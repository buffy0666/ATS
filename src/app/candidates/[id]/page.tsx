import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { EmailComposer } from "./EmailComposer";
import { EmailHistory } from "./EmailHistory";
import { NotesSection } from "./NotesSection";
import { CandidateJobsSection } from "./CandidateJobsSection";
import { EditableField } from "./EditableField";
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
import { CHOICE_FIELDS, ensureChoiceDefaults, loadChoiceOptions } from "@/lib/choices";
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

  // Lazy-seed the source/seniority choice registries so the inline editors
  // always have something to pick from, even on a fresh org.
  await Promise.all([
    ensureChoiceDefaults(CHOICE_FIELDS.candidateSource.key, CHOICE_FIELDS.candidateSource.defaults, orgId),
    ensureChoiceDefaults(CHOICE_FIELDS.candidateSeniority.key, CHOICE_FIELDS.candidateSeniority.defaults, orgId),
  ]);

  const [
    candidate,
    notes,
    templates,
    candidateEnrollments,
    availableSequences,
    customFields,
    customFieldValues,
    openJobs,
    sourceOptions,
    seniorityOptions,
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
      // Pinned notes first (most-recently-pinned at the top), then everything
      // else by creation order.
      orderBy: [
        { pinnedAt: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
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
    loadChoiceOptions(CHOICE_FIELDS.candidateSource.key, orgId),
    loadChoiceOptions(CHOICE_FIELDS.candidateSeniority.key, orgId),
  ]);

  if (!candidate) notFound();

  const senderName = session?.user?.name ?? session?.user?.email ?? "ATS";

  const formatSalary = (n: number | null) =>
    n == null ? null : `${candidate.salaryCurrency} ${n.toLocaleString()}`;

  // Option lists for the inline editors.
  const toISODate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const intStr = (n: number | null) => (n != null ? String(n) : "");
  const workAuthOptions = (Object.keys(WORK_AUTH_LABEL) as WorkAuth[]).map((k) => ({ value: k, label: WORK_AUTH_LABEL[k] }));
  const employmentTypeOptions = (Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((k) => ({ value: k, label: EMPLOYMENT_TYPE_LABEL[k] }));
  const remoteOptions = (Object.keys(REMOTE_PREF_LABEL) as RemotePref[]).map((k) => ({ value: k, label: REMOTE_PREF_LABEL[k] }));
  const statusOptions = (Object.keys(STATUS_LABEL) as CandidateStatus[]).map((k) => ({ value: k, label: STATUS_LABEL[k] }));
  const sourceSelectOptions = sourceOptions.map((o) => ({ value: o.name, label: SOURCE_LABEL[o.name] ?? o.name }));
  const senioritySelectOptions = seniorityOptions.map((o) => ({ value: o.name, label: SENIORITY_LABEL[o.name] ?? o.name }));
  const ratingOptions = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${"★".repeat(n)} (${n})` }));

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
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Communication ({candidate.emails.length})
                    </span>
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

          <p className="mb-4 text-xs text-zinc-400">Click any field below to edit it.</p>

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

              <DetailGrid title="Identity">
                <EditableField candidateId={candidate.id} field="firstName" label="First name" type="text" value={candidate.firstName} required />
                <EditableField candidateId={candidate.id} field="lastName" label="Last name" type="text" value={candidate.lastName} required />
                <EditableField candidateId={candidate.id} field="preferredName" label="Preferred name" type="text" value={candidate.preferredName} />
                <EditableField candidateId={candidate.id} field="pronouns" label="Pronouns" type="text" value={candidate.pronouns} placeholder="she/her, he/him, they/them" />
              </DetailGrid>

              <DetailGrid title="Contact">
                <EditableField candidateId={candidate.id} field="email" label="Email" type="email" value={candidate.email} required />
                <EditableField candidateId={candidate.id} field="alternateEmail" label="Alternate email" type="email" value={candidate.alternateEmail} />
                <EditableField candidateId={candidate.id} field="phone" label="Phone" type="text" value={candidate.phone} />
                <EditableField candidateId={candidate.id} field="alternatePhone" label="Alternate phone" type="text" value={candidate.alternatePhone} />
              </DetailGrid>

              <DetailGrid title="Location & work authorization">
                <EditableField candidateId={candidate.id} field="locationCity" label="City" type="text" value={candidate.locationCity} />
                <EditableField candidateId={candidate.id} field="locationState" label="State / region" type="text" value={candidate.locationState} />
                <EditableField candidateId={candidate.id} field="locationCountry" label="Country" type="text" value={candidate.locationCountry} />
                <EditableField candidateId={candidate.id} field="timezone" label="Timezone" type="text" value={candidate.timezone} placeholder="America/New_York" />
                <EditableField candidateId={candidate.id} field="willingToRelocate" label="Open to relocation" type="bool" value={candidate.willingToRelocate} />
                <EditableField candidateId={candidate.id} field="workAuthorization" label="Work authorization" type="select" value={candidate.workAuthorization} options={workAuthOptions} />
                <EditableField candidateId={candidate.id} field="requiresSponsorship" label="Requires sponsorship" type="bool" value={candidate.requiresSponsorship} />
              </DetailGrid>

              <DetailGrid title="Career">
                <EditableField candidateId={candidate.id} field="currentTitle" label="Current title" type="text" value={candidate.currentTitle} />
                <EditableField candidateId={candidate.id} field="currentCompany" label="Current company" type="text" value={candidate.currentCompany} />
                <EditableField candidateId={candidate.id} field="yearsExperience" label="Years of experience" type="number" value={intStr(candidate.yearsExperience)} />
                <EditableField candidateId={candidate.id} field="seniority" label="Seniority" type="select" value={candidate.seniority} options={senioritySelectOptions} />
              </DetailGrid>

              <DetailGrid title="Compensation & availability">
                <EditableField candidateId={candidate.id} field="desiredSalaryMin" label="Desired salary (min)" type="number" value={intStr(candidate.desiredSalaryMin)} display={formatSalary(candidate.desiredSalaryMin)} />
                <EditableField candidateId={candidate.id} field="desiredSalaryMax" label="Desired salary (max)" type="number" value={intStr(candidate.desiredSalaryMax)} display={formatSalary(candidate.desiredSalaryMax)} />
                <EditableField candidateId={candidate.id} field="currentSalary" label="Current salary" type="number" value={intStr(candidate.currentSalary)} display={formatSalary(candidate.currentSalary)} />
                <EditableField candidateId={candidate.id} field="salaryCurrency" label="Currency" type="text" value={candidate.salaryCurrency} placeholder="USD" />
                <EditableField candidateId={candidate.id} field="availableFrom" label="Available from" type="date" value={toISODate(candidate.availableFrom)} display={candidate.availableFrom ? candidate.availableFrom.toLocaleDateString() : null} />
                <EditableField candidateId={candidate.id} field="noticePeriodDays" label="Notice period (days)" type="number" value={intStr(candidate.noticePeriodDays)} />
                <EditableField candidateId={candidate.id} field="employmentTypePref" label="Employment type" type="multiselect" value={candidate.employmentTypePref} options={employmentTypeOptions} />
                <EditableField candidateId={candidate.id} field="remotePref" label="Work mode" type="multiselect" value={candidate.remotePref} options={remoteOptions} />
              </DetailGrid>
            </div>

            {/* Right column */}
            <div className="space-y-6 min-w-0">
              <DetailGrid title="Focus">
                <EditableField candidateId={candidate.id} field="industries" label="Industries" type="list" value={candidate.industries} placeholder="Comma-separated" />
                <EditableField candidateId={candidate.id} field="specialties" label="Specialties" type="list" value={candidate.specialties} placeholder="Comma-separated" />
              </DetailGrid>

              <DetailGrid title="Links">
                <EditableField candidateId={candidate.id} field="linkedinUrl" label="LinkedIn" type="url" value={candidate.linkedinUrl} display={linkOrNull(candidate.linkedinUrl)} placeholder="https://linkedin.com/in/…" />
                <EditableField candidateId={candidate.id} field="githubUrl" label="GitHub" type="url" value={candidate.githubUrl} display={linkOrNull(candidate.githubUrl)} placeholder="https://github.com/…" />
                <EditableField candidateId={candidate.id} field="portfolioUrl" label="Portfolio" type="url" value={candidate.portfolioUrl} display={linkOrNull(candidate.portfolioUrl)} placeholder="https://…" />
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
                <EditableField
                  candidateId={candidate.id}
                  field="otherUrls"
                  label="Other URLs"
                  type="list"
                  value={candidate.otherUrls}
                  placeholder="One per line or comma-separated"
                  display={
                    candidate.otherUrls.length > 0 ? (
                      <ul className="space-y-0.5">
                        {candidate.otherUrls.map((u) => (
                          <li key={u}>
                            <a href={u} target="_blank" rel="noopener noreferrer" className="underline break-all">
                              {u}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : undefined
                  }
                />
              </DetailGrid>

              <DetailGrid title="Source & ownership">
                <EditableField candidateId={candidate.id} field="status" label="Status" type="select" value={candidate.status} options={statusOptions} required />
                <EditableField candidateId={candidate.id} field="rating" label="Rating" type="select" value={intStr(candidate.rating)} options={ratingOptions} />
                <EditableField candidateId={candidate.id} field="source" label="Source" type="select" value={candidate.source} options={sourceSelectOptions} />
                <EditableField candidateId={candidate.id} field="sourceDetail" label="Source detail" type="text" value={candidate.sourceDetail} />
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
                <EditableField
                  candidateId={candidate.id}
                  field="nextFollowUpAt"
                  label="Next follow-up"
                  type="date"
                  value={toISODate(candidate.nextFollowUpAt)}
                  display={candidate.nextFollowUpAt ? candidate.nextFollowUpAt.toLocaleDateString() : null}
                />
                <Detail
                  label="Email subscription"
                  value={candidate.unsubscribedAt ? "Unsubscribed" : "Subscribed"}
                />
                <Detail label="Added" value={candidate.createdAt.toLocaleDateString()} />
              </DetailGrid>

              <EditableField
                candidateId={candidate.id}
                field="skills"
                label="Skills"
                type="list"
                value={candidate.skills}
                placeholder="Comma-separated"
                display={
                  candidate.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.skills.map((s) => (
                        <span key={s} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : undefined
                }
              />

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
