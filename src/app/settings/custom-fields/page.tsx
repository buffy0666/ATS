import { CustomFieldEntity } from "@/generated/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import {
  CUSTOM_FIELD_ENTITY_LABEL,
  loadCustomFields,
} from "@/lib/custom-fields";
import { CustomFieldsEntitySection } from "./CustomFieldsEntitySection";

const ENTITY_ORDER: CustomFieldEntity[] = [
  CustomFieldEntity.CLIENT,
  CustomFieldEntity.CLIENT_CONTACT,
  CustomFieldEntity.CANDIDATE,
  CustomFieldEntity.INTERVIEW,
  CustomFieldEntity.TASK,
  CustomFieldEntity.JOB,
  CustomFieldEntity.USER,
];

export default async function CustomFieldsSettingsPage() {
  const { orgId } = await requireAdminWithOrg();

  const sections = await Promise.all(
    ENTITY_ORDER.map(async (entity) => ({
      entity,
      label: CUSTOM_FIELD_ENTITY_LABEL[entity],
      fields: await loadCustomFields(entity, orgId),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Custom fields</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Add admin-managed fields to any record type. Fields render on the create / edit forms
          for that entity and appear on its detail page. Deleting a field removes the values
          stored on every record using it.
        </p>
      </div>

      {sections.map((s) => (
        <CustomFieldsEntitySection
          key={s.entity}
          entity={s.entity}
          entityLabel={s.label}
          fields={s.fields}
        />
      ))}
    </div>
  );
}
