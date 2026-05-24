"use client";

import { useState, useTransition } from "react";
import {
  CustomFieldEntity,
  CustomFieldType,
} from "@/generated/prisma";
import { CUSTOM_FIELD_TYPE_LABEL, type CustomFieldRow } from "@/lib/custom-fields-shared";
import {
  createCustomField,
  deleteCustomField,
  reorderCustomField,
  updateCustomField,
  type CustomFieldResult,
} from "./actions";

const TYPE_VALUES = Object.values(CustomFieldType);

export function CustomFieldsEntitySection({
  entity,
  entityLabel,
  fields,
}: {
  entity: CustomFieldEntity;
  entityLabel: string;
  fields: CustomFieldRow[];
}) {
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);

  function showResult(r: CustomFieldResult, success: string) {
    if (r.ok) {
      setBanner({ tone: "ok", text: success });
    } else {
      setBanner({ tone: "err", text: r.error });
    }
    setTimeout(() => setBanner(null), 5000);
  }

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        className="w-full flex items-start gap-3 text-left p-5 hover:bg-zinc-50 dark:hover:bg-zinc-950 rounded-lg"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 text-base font-medium leading-none text-zinc-600 dark:text-zinc-300"
        >
          {open ? "−" : "+"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">{entityLabel}</h2>
            <span className="text-xs text-zinc-500 tabular-nums">
              {fields.length} custom field{fields.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {banner && (
            <p
              className={`text-sm ${
                banner.tone === "ok"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
              aria-live="polite"
            >
              {banner.text}
            </p>
          )}

          {fields.length === 0 ? (
            <p className="text-sm text-zinc-500">No custom fields yet for this entity.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
              {fields.map((f, idx) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  isFirst={idx === 0}
                  isLast={idx === fields.length - 1}
                  onResult={(r) => showResult(r, "Saved.")}
                  onDeleteResult={(r) => showResult(r, "Deleted.")}
                  onReorderResult={(r) => showResult(r, "Reordered.")}
                />
              ))}
            </ul>
          )}

          {adding ? (
            <AddFieldForm
              entity={entity}
              onCancel={() => setAdding(false)}
              onCreated={(r) => {
                showResult(r, "Field added.");
                if (r.ok) setAdding(false);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              + Add custom field
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function FieldRow({
  field,
  isFirst,
  isLast,
  onResult,
  onDeleteResult,
  onReorderResult,
}: {
  field: CustomFieldRow;
  isFirst: boolean;
  isLast: boolean;
  onResult: (r: CustomFieldResult) => void;
  onDeleteResult: (r: CustomFieldResult) => void;
  onReorderResult: (r: CustomFieldResult) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <li className="p-3">
        <EditFieldForm
          field={field}
          onCancel={() => setEditing(false)}
          onSaved={(r) => {
            onResult(r);
            if (r.ok) setEditing(false);
          }}
        />
      </li>
    );
  }

  function confirmDelete() {
    if (
      !confirm(
        `Delete custom field "${field.label}"? Existing values stored on records will also be deleted.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      onDeleteResult(await deleteCustomField(field.id));
    });
  }

  function move(direction: "up" | "down") {
    startTransition(async () => {
      onReorderResult(await reorderCustomField(field.id, direction));
    });
  }

  return (
    <li className="flex items-start gap-3 px-3 py-3 text-sm">
      <div className="flex flex-col gap-0.5 shrink-0 text-zinc-400">
        <button
          type="button"
          onClick={() => move("up")}
          disabled={pending || isFirst}
          aria-label="Move up"
          className="text-xs hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => move("down")}
          disabled={pending || isLast}
          aria-label="Move down"
          className="text-xs hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-30"
        >
          ▼
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline flex-wrap gap-2">
          <span className="font-medium">{field.label}</span>
          <span className="font-mono text-[11px] text-zinc-500">{field.key}</span>
          <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">
            {CUSTOM_FIELD_TYPE_LABEL[field.type]}
          </span>
          {field.required && (
            <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-2 py-0.5 text-[10px] uppercase tracking-wide">
              Required
            </span>
          )}
        </div>
        {field.helpText && (
          <p className="text-xs text-zinc-500 mt-0.5">{field.helpText}</p>
        )}
        {field.options.length > 0 && (
          <p className="text-xs text-zinc-500 mt-0.5">
            Options: {field.options.join(", ")}
          </p>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={pending}
          className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function AddFieldForm({
  entity,
  onCancel,
  onCreated,
}: {
  entity: CustomFieldEntity;
  onCancel: () => void;
  onCreated: (r: CustomFieldResult) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState<CustomFieldType>(CustomFieldType.TEXT);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("entity", entity);
    startTransition(async () => {
      onCreated(await createCustomField(fd));
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3"
    >
      <FieldDefinitionInputs type={type} onTypeChange={setType} />
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add field"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditFieldForm({
  field,
  onCancel,
  onSaved,
}: {
  field: CustomFieldRow;
  onCancel: () => void;
  onSaved: (r: CustomFieldResult) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("entity", field.entity);
    fd.set("type", field.type); // type is locked once created
    startTransition(async () => {
      onSaved(await updateCustomField(field.id, fd));
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3"
    >
      <FieldDefinitionInputs
        type={field.type}
        onTypeChange={() => {}}
        typeLocked
        defaults={{
          key: field.key,
          label: field.label,
          helpText: field.helpText ?? "",
          required: field.required,
          options: field.options.join("\n"),
        }}
      />
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function FieldDefinitionInputs({
  type,
  onTypeChange,
  typeLocked,
  defaults,
}: {
  type: CustomFieldType;
  onTypeChange: (t: CustomFieldType) => void;
  typeLocked?: boolean;
  defaults?: {
    key?: string;
    label?: string;
    helpText?: string;
    required?: boolean;
    options?: string;
  };
}) {
  const showOptions = type === CustomFieldType.SELECT || type === CustomFieldType.MULTI_SELECT;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1" htmlFor="label">
            Label
          </label>
          <input
            id="label"
            name="label"
            required
            maxLength={120}
            defaultValue={defaults?.label}
            placeholder="What recruiters see"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1" htmlFor="key">
            Key
          </label>
          <input
            id="key"
            name="key"
            required
            maxLength={60}
            defaultValue={defaults?.key}
            placeholder="snake_case_id"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1" htmlFor="type">
            Type
          </label>
          <select
            id="type"
            name="type"
            value={type}
            disabled={typeLocked}
            onChange={(e) => onTypeChange(e.target.value as CustomFieldType)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm disabled:opacity-60"
          >
            {TYPE_VALUES.map((t) => (
              <option key={t} value={t}>
                {CUSTOM_FIELD_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {typeLocked && (
            <p className="text-[11px] text-zinc-500 mt-1">
              Type can&apos;t change once created. Delete and recreate if you need a different type.
            </p>
          )}
        </div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="required"
              defaultChecked={defaults?.required}
              className="rounded border-zinc-300 dark:border-zinc-700"
            />
            Required
          </label>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1" htmlFor="helpText">
          Help text
        </label>
        <input
          id="helpText"
          name="helpText"
          maxLength={500}
          defaultValue={defaults?.helpText}
          placeholder="Optional — shown under the input"
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        />
      </div>
      {showOptions && (
        <div>
          <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1" htmlFor="options">
            Options
          </label>
          <textarea
            id="options"
            name="options"
            rows={4}
            defaultValue={defaults?.options}
            placeholder={"One per line or comma-separated, e.g.\nHot\nWarm\nCold"}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}
