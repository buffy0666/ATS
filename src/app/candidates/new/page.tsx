import { CustomFieldEntity } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CHOICE_FIELDS, ensureChoiceDefaults, loadChoiceOptions } from "@/lib/choices";
import { loadCustomFields } from "@/lib/custom-fields";
import { CandidateForm } from "./CandidateForm";

export default async function NewCandidatePage({
  searchParams,
}: {
  // Used by the Chrome extension's "Create candidate" toast — when an
  // email captured from Outlook didn't match a known candidate, the
  // server returns a URL like /candidates/new?email=foo@bar.com&name=Foo+Bar
  // and the form pre-fills.
  searchParams: Promise<{ email?: string; name?: string }>;
}) {
  const { session, orgId } = await requireSessionWithOrg();
  const { email: prefillEmail, name: prefillName } = await searchParams;

  // Lazy-seed default options so the form's dropdowns always have something
  // selectable, even on a fresh database.
  await Promise.all([
    ensureChoiceDefaults(
      CHOICE_FIELDS.candidateSource.key,
      CHOICE_FIELDS.candidateSource.defaults,
      orgId,
    ),
    ensureChoiceDefaults(
      CHOICE_FIELDS.candidateSeniority.key,
      CHOICE_FIELDS.candidateSeniority.defaults,
      orgId,
    ),
  ]);

  const [users, contacts, allTags, sourceOptions, seniorityOptions, customFields] =
    await Promise.all([
      // Users in this org only — we'll filter by the same orgId below.
      prisma.user.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      }),
      prisma.clientContact.findMany({
        where: { status: "ACTIVE", organizationId: orgId },
        orderBy: [{ client: { name: "asc" } }, { lastName: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          client: { select: { name: true } },
        },
      }),
      prisma.tag.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      }),
      loadChoiceOptions(CHOICE_FIELDS.candidateSource.key, orgId),
      loadChoiceOptions(CHOICE_FIELDS.candidateSeniority.key, orgId),
      loadCustomFields(CustomFieldEntity.CANDIDATE, orgId),
    ]);

  const contactOptions = contacts.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    clientName: c.client.name,
  }));

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">New candidate</h1>
      <CandidateForm
        users={users}
        contacts={contactOptions}
        allTags={allTags}
        currentUserId={session.user.id ?? ""}
        sourceOptions={sourceOptions.map((o) => ({ id: o.id, name: o.name }))}
        seniorityOptions={seniorityOptions.map((o) => ({ id: o.id, name: o.name }))}
        customFields={customFields}
        prefill={splitPrefill(prefillEmail, prefillName)}
      />
    </main>
  );
}

/**
 * Split a "Name <email>" or "Lastname, Firstname" or "Firstname Lastname"
 * query-param into the form's first/last name fields. Best-effort —
 * recruiter can always fix up afterwards.
 */
function splitPrefill(
  email: string | undefined,
  name: string | undefined,
): { email?: string; firstName?: string; lastName?: string } | undefined {
  if (!email && !name) return undefined;
  let firstName: string | undefined;
  let lastName: string | undefined;
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    if (trimmed.includes(",")) {
      // "Lastname, Firstname"
      const [last, first] = trimmed.split(",").map((s) => s.trim());
      lastName = last || undefined;
      firstName = first || undefined;
    } else {
      // "Firstname Lastname" — first token is first name, rest is last.
      const parts = trimmed.split(/\s+/);
      firstName = parts[0];
      lastName = parts.slice(1).join(" ") || undefined;
    }
  }
  return { email, firstName, lastName };
}
