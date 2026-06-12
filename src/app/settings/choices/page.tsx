import { requireAdminWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { CHOICE_FIELDS, ensureChoiceDefaults, loadChoiceOptions } from "@/lib/choices";
import { ChoicesSection, type ChoiceRow } from "./ChoicesSection";

const SECTIONS = [
  {
    key: CHOICE_FIELDS.candidateSource.key,
    label: CHOICE_FIELDS.candidateSource.label,
    helper: CHOICE_FIELDS.candidateSource.helper,
    defaults: CHOICE_FIELDS.candidateSource.defaults,
    column: "source" as const,
  },
  {
    key: CHOICE_FIELDS.candidateSeniority.key,
    label: CHOICE_FIELDS.candidateSeniority.label,
    helper: CHOICE_FIELDS.candidateSeniority.helper,
    defaults: CHOICE_FIELDS.candidateSeniority.defaults,
    column: "seniority" as const,
  },
];

export default async function ChoicesSettingsPage() {
  const { orgId } = await requireAdminWithOrg();

  // Lazily seed defaults per-org so the user never sees an empty table.
  await Promise.all(SECTIONS.map((s) => ensureChoiceDefaults(s.key, s.defaults, orgId)));

  const sections = await Promise.all(
    SECTIONS.map(async (s) => {
      const options = await loadChoiceOptions(s.key, orgId);
      const usageCounts = await Promise.all(
        options.map((o) =>
          s.column === "source"
            ? prisma.candidate.count({ where: { source: o.name, organizationId: orgId } })
            : prisma.candidate.count({ where: { seniority: o.name, organizationId: orgId } }),
        ),
      );
      const rows: ChoiceRow[] = options.map((o, i) => ({
        id: o.id,
        name: o.name,
        usage: usageCounts[i],
      }));
      return { ...s, rows };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Choices</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Edit dropdown options used across the app. Renaming an option updates every record
          currently using that value. Deleting an option clears the field on those records (as if
          it was never set).
        </p>
      </div>

      {sections.map((s) => (
        <ChoicesSection
          key={s.key}
          fieldKey={s.key}
          fieldLabel={s.label}
          helper={s.helper}
          rows={s.rows}
        />
      ))}
    </div>
  );
}
