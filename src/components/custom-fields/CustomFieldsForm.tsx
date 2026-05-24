"use client";

import { CustomFieldType, type CustomFieldValue } from "@/generated/prisma";
import { type CustomFieldRow } from "@/lib/custom-fields-shared";

/**
 * Render input controls for an entity's custom fields. Drop into any existing
 * create/edit form — the inputs use `name="cf:<fieldId>"` so the server-side
 * helper `saveCustomFieldValues` can route them by field id.
 */
export function CustomFieldsForm({
  fields,
  values,
  legend = "Custom fields",
}: {
  fields: CustomFieldRow[];
  values?: Map<string, CustomFieldValue>;
  legend?: string;
}) {
  if (fields.length === 0) return null;
  return (
    <fieldset className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {legend}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map((f) => (
          <FieldInput key={f.id} field={f} value={values?.get(f.id)} />
        ))}
      </div>
    </fieldset>
  );
}

function FieldInput({
  field,
  value,
}: {
  field: CustomFieldRow;
  value: CustomFieldValue | undefined;
}) {
  const name = `cf:${field.id}`;
  const inputClass =
    "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm";

  const wrap = (child: React.ReactNode, spanFull = false) => (
    <div className={spanFull ? "sm:col-span-2" : undefined}>
      <label className="block text-sm font-medium mb-1" htmlFor={name}>
        {field.label}
        {field.required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {child}
      {field.helpText && (
        <p className="text-[11px] text-zinc-500 mt-1">{field.helpText}</p>
      )}
    </div>
  );

  switch (field.type) {
    case CustomFieldType.TEXT:
      return wrap(
        <input
          id={name}
          name={name}
          type="text"
          required={field.required}
          defaultValue={value?.valueText ?? ""}
          maxLength={400}
          className={inputClass}
        />,
      );
    case CustomFieldType.LONG_TEXT:
      return wrap(
        <textarea
          id={name}
          name={name}
          required={field.required}
          rows={4}
          defaultValue={value?.valueText ?? ""}
          maxLength={5000}
          className={inputClass}
        />,
        true,
      );
    case CustomFieldType.NUMBER:
      return wrap(
        <input
          id={name}
          name={name}
          type="number"
          required={field.required}
          step="any"
          defaultValue={value?.valueNumber ?? ""}
          className={inputClass}
        />,
      );
    case CustomFieldType.DATE:
      return wrap(
        <input
          id={name}
          name={name}
          type="date"
          required={field.required}
          defaultValue={
            value?.valueDate ? value.valueDate.toISOString().slice(0, 10) : ""
          }
          className={inputClass}
        />,
      );
    case CustomFieldType.BOOLEAN:
      return wrap(
        <label className="inline-flex items-center gap-2 text-sm pt-2">
          <input
            id={name}
            name={name}
            type="checkbox"
            defaultChecked={value?.valueBoolean ?? false}
            className="rounded border-zinc-300 dark:border-zinc-700"
          />
          <span className="text-zinc-600 dark:text-zinc-300">Yes</span>
        </label>,
      );
    case CustomFieldType.URL:
      return wrap(
        <input
          id={name}
          name={name}
          type="url"
          required={field.required}
          defaultValue={value?.valueText ?? ""}
          placeholder="https://…"
          className={inputClass}
        />,
      );
    case CustomFieldType.EMAIL:
      return wrap(
        <input
          id={name}
          name={name}
          type="email"
          required={field.required}
          defaultValue={value?.valueText ?? ""}
          className={inputClass}
        />,
      );
    case CustomFieldType.SELECT:
      return wrap(
        <select
          id={name}
          name={name}
          required={field.required}
          defaultValue={value?.valueText ?? ""}
          className={inputClass}
        >
          <option value="">— Select —</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>,
      );
    case CustomFieldType.MULTI_SELECT: {
      const selected = new Set(value?.valueStrings ?? []);
      return wrap(
        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
          {field.options.map((opt) => (
            <label key={opt} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={name}
                value={opt}
                defaultChecked={selected.has(opt)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>,
        true,
      );
    }
  }
}
