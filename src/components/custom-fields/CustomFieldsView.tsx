import { CustomFieldType, type CustomFieldValue } from "@/generated/prisma";
import { type CustomFieldRow } from "@/lib/custom-fields-shared";

/**
 * Read-only render of an entity's custom field values on a detail page.
 * Skips empty values to keep the layout tight.
 */
export function CustomFieldsView({
  fields,
  values,
  title = "Custom fields",
}: {
  fields: CustomFieldRow[];
  values: Map<string, CustomFieldValue>;
  title?: string;
}) {
  if (fields.length === 0) return null;

  const items = fields
    .map((f) => ({ field: f, rendered: renderValue(f, values.get(f.id)) }))
    .filter((it) => it.rendered != null);

  if (items.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
        {title}
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map((it) => (
          <div key={it.field.id}>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{it.field.label}</dt>
            <dd className="text-sm mt-0.5">{it.rendered}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function renderValue(field: CustomFieldRow, value: CustomFieldValue | undefined): React.ReactNode {
  if (!value) return null;
  switch (field.type) {
    case CustomFieldType.TEXT:
    case CustomFieldType.LONG_TEXT:
    case CustomFieldType.SELECT:
      return value.valueText ? (
        <span className="whitespace-pre-wrap">{value.valueText}</span>
      ) : null;
    case CustomFieldType.NUMBER:
      return value.valueNumber != null ? value.valueNumber.toLocaleString() : null;
    case CustomFieldType.DATE:
      return value.valueDate ? value.valueDate.toLocaleDateString() : null;
    case CustomFieldType.BOOLEAN:
      return value.valueBoolean == null
        ? null
        : value.valueBoolean
          ? "Yes"
          : "No";
    case CustomFieldType.URL:
      return value.valueText ? (
        <a href={value.valueText} target="_blank" rel="noopener noreferrer" className="underline break-all">
          {value.valueText}
        </a>
      ) : null;
    case CustomFieldType.EMAIL:
      return value.valueText ? (
        <a href={`mailto:${value.valueText}`} className="underline break-all">
          {value.valueText}
        </a>
      ) : null;
    case CustomFieldType.MULTI_SELECT:
      return value.valueStrings && value.valueStrings.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.valueStrings.map((s) => (
            <span
              key={s}
              className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs"
            >
              {s}
            </span>
          ))}
        </div>
      ) : null;
  }
}
