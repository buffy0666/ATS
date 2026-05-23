import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EmailComposer } from "./EmailComposer";
import { EmailHistory } from "./EmailHistory";
import { NotesSection } from "./NotesSection";
import {
  CandidateStatus,
  CandidateSource,
  EmploymentType,
  RemotePref,
  Role,
  Seniority,
  WorkAuth,
} from "@/generated/prisma";
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

const SENIORITY_LABEL: Record<Seniority, string> = {
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

const SOURCE_LABEL: Record<CandidateSource, string> = {
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

  const [candidate, session, notes, templates] = await Promise.all([
    prisma.candidate.findUnique({
      where: { id },
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
    auth(),
    prisma.note.findMany({
      where: { application: { candidateId: id } },
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
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, body: true },
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

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10">
      <Link href="/candidates" className="text-sm text-zinc-500 hover:underline">
        ← All candidates
      </Link>

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
      </div>

      {(candidate.currentTitle || candidate.currentCompany) && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {candidate.currentTitle}
          {candidate.currentTitle && candidate.currentCompany && " at "}
          {candidate.currentCompany}
        </p>
      )}

      <p className="mt-1 text-sm text-zinc-500">{candidate.email}</p>

      {candidate.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
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

      {candidate.summary && (
        <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {candidate.summary}
        </p>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Jobs ({candidate.applications.length})
        </h2>
        {candidate.applications.length === 0 ? (
          <p className="text-sm text-zinc-500">Not associated with any job yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {candidate.applications.map((a) => (
              <Link
                key={a.id}
                href={`/jobs/${a.job.id}`}
                className="inline-flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm hover:border-zinc-400 dark:hover:border-zinc-600"
              >
                <span className="font-medium">{a.job.title}</span>
                <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  {a.stage.replace(/_/g, " ")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

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
          value={candidate.seniority ? SENIORITY_LABEL[candidate.seniority] : null}
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
          value={candidate.source ? SOURCE_LABEL[candidate.source] : null}
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
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
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
        <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Notes
          </h2>
          <p className="whitespace-pre-wrap text-sm">{candidate.notes}</p>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Communication ({candidate.emails.length})
          </h2>
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
      </section>

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

    </main>
  );
}

function DetailGrid({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-sm">{value || <span className="text-zinc-400">—</span>}</div>
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
