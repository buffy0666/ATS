"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FILTER_FIELDS,
  FILTER_FIELD_BY_KEY,
  NO_VALUE_OPERATORS,
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  RANGE_OPERATORS,
  decodeRules,
  encodeRules,
  type FilterFieldDef,
  type FilterRule,
  type Operator,
} from "./filter-builder";

type TagOption = { id: string; name: string; color: string };
type ChoiceOption = { id: string; name: string };
type Option = { value: string; label: string };

/**
 * Advanced filter builder: rows of "Field / operator / value" AND-ed together,
 * serialized into the `fb` URL param so they're captured by saved views. The
 * server (candidates/page.tsx) is the source of truth for how each operator
 * maps to a query — this component only edits the rule list.
 */
export function FilterBuilder({
  availableTags,
  sourceOptions,
  seniorityOptions,
  listOptions = [],
  clientOptions = [],
  userOptions = [],
  rejectionReasonOptions = [],
}: {
  availableTags: TagOption[];
  sourceOptions: ChoiceOption[];
  seniorityOptions: ChoiceOption[];
  listOptions?: { id: string; name: string }[];
  clientOptions?: { id: string; name: string }[];
  userOptions?: { id: string; name: string | null; email: string }[];
  rejectionReasonOptions?: ChoiceOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rules = useMemo(
    () => decodeRules(searchParams.get("fb")),
    [searchParams],
  );
  const [open, setOpen] = useState(() => rules.length > 0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function optionsFor(def: FilterFieldDef): Option[] | null {
    if (def.staticOptions) {
      return def.staticOptions.map((v) => ({
        value: v,
        label: v.replace(/_/g, " "),
      }));
    }
    if (def.dynamicOptions === "tags") {
      return availableTags.map((t) => ({ value: t.name, label: t.name }));
    }
    if (def.dynamicOptions === "source") {
      return sourceOptions.map((o) => ({ value: o.name, label: o.name }));
    }
    if (def.dynamicOptions === "seniority") {
      return seniorityOptions.map((o) => ({ value: o.name, label: o.name }));
    }
    if (def.dynamicOptions === "lists") {
      return listOptions.map((o) => ({ value: o.name, label: o.name }));
    }
    if (def.dynamicOptions === "clients") {
      // Values are IDs (client names aren't unique) — labels show the name.
      return clientOptions.map((o) => ({ value: o.id, label: o.name }));
    }
    if (def.dynamicOptions === "users") {
      return userOptions.map((o) => ({ value: o.id, label: o.name ?? o.email }));
    }
    if (def.dynamicOptions === "rejectionReasons") {
      return rejectionReasonOptions.map((o) => ({ value: o.name, label: o.name }));
    }
    return null;
  }

  function commit(next: FilterRule[], immediate: boolean) {
    const apply = () => {
      const params = new URLSearchParams(searchParams.toString());
      const enc = encodeRules(next);
      if (enc) params.set("fb", enc);
      else params.delete("fb");
      // A changed rule set can leave the user past the last page.
      params.delete("page");
      const qs = params.toString();
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    };
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (immediate) apply();
    else debounceRef.current = setTimeout(apply, 350);
  }

  function addRule() {
    const def = FILTER_FIELDS[0];
    const op = OPERATORS_BY_TYPE[def.type][0];
    commit([...rules, { f: def.key, op, v: [] }], true);
  }

  function removeRule(index: number) {
    commit(
      rules.filter((_, i) => i !== index),
      true,
    );
  }

  function changeField(index: number, fieldKey: string) {
    const def = FILTER_FIELD_BY_KEY[fieldKey];
    if (!def) return;
    const op = OPERATORS_BY_TYPE[def.type][0];
    commit(
      rules.map((r, i) => (i === index ? { f: fieldKey, op, v: [] } : r)),
      true,
    );
  }

  function changeOp(index: number, op: Operator) {
    commit(
      rules.map((r, i) =>
        i === index
          ? { ...r, op, v: NO_VALUE_OPERATORS.has(op) ? [] : r.v }
          : r,
      ),
      true,
    );
  }

  function changeValue(index: number, v: string[], immediate: boolean) {
    commit(
      rules.map((r, i) => (i === index ? { ...r, v } : r)),
      immediate,
    );
  }

  function clearAll() {
    commit([], true);
  }

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span>
          Filter builder{rules.length > 0 ? ` (${rules.length} rule${rules.length === 1 ? "" : "s"})` : ""}
        </span>
        <span className="text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
          {rules.length === 0 && (
            <p className="text-xs text-zinc-500">
              No rules yet. Add a rule to filter by any field — including
              negative conditions like “is not”, “does not contain”, or “is
              empty”. Rules are combined with AND.
            </p>
          )}

          {rules.map((rule, index) => {
            const def = FILTER_FIELD_BY_KEY[rule.f] ?? FILTER_FIELDS[0];
            const operators = OPERATORS_BY_TYPE[def.type];
            return (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 text-xs"
              >
                {/* Field */}
                <select
                  value={rule.f}
                  onChange={(e) => changeField(index, e.target.value)}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
                >
                  {FILTER_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>

                {/* Operator */}
                <select
                  value={rule.op}
                  onChange={(e) => changeOp(index, e.target.value as Operator)}
                  className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
                >
                  {operators.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </select>

                {/* Value(s) */}
                <ValueControl
                  def={def}
                  rule={rule}
                  options={optionsFor(def)}
                  onChange={(v, immediate) => changeValue(index, v, immediate)}
                />

                <button
                  type="button"
                  onClick={() => removeRule(index)}
                  className="ml-auto rounded-md border border-red-300 dark:border-red-800 px-2 py-1 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  Remove
                </button>
              </div>
            );
          })}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={addRule}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              + Add filter rule
            </button>
            {rules.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
              >
                Clear rules
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ValueControl({
  def,
  rule,
  options,
  onChange,
}: {
  def: FilterFieldDef;
  rule: FilterRule;
  options: Option[] | null;
  onChange: (v: string[], immediate: boolean) => void;
}) {
  const { op } = rule;

  // Operators that need no value (isEmpty / isNotEmpty / isTrue / isFalse).
  if (NO_VALUE_OPERATORS.has(op)) return null;

  const inputClass =
    "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5";

  // Ranges: two typed inputs.
  if (RANGE_OPERATORS.has(op)) {
    const type = def.type === "date" ? "date" : "number";
    return (
      <span className="flex items-center gap-1">
        <input
          type={type}
          value={rule.v[0] ?? ""}
          onChange={(e) => onChange([e.target.value, rule.v[1] ?? ""], false)}
          className={`w-28 ${inputClass}`}
        />
        <span className="text-zinc-400">–</span>
        <input
          type={type}
          value={rule.v[1] ?? ""}
          onChange={(e) => onChange([rule.v[0] ?? "", e.target.value], false)}
          className={`w-28 ${inputClass}`}
        />
      </span>
    );
  }

  // Option-backed multi-value (enum / tags / array with a fixed option set).
  if (
    (def.type === "enum" || def.type === "tags" || def.type === "array") &&
    options
  ) {
    return (
      <OptionMultiSelect
        options={options}
        value={rule.v}
        onChange={(v) => onChange(v, true)}
      />
    );
  }

  // Free-text string arrays (industries / specialties): comma-separated.
  if (def.type === "array") {
    return (
      <input
        type="text"
        value={rule.v.join(", ")}
        placeholder="value, value…"
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            false,
          )
        }
        className={`w-56 ${inputClass}`}
      />
    );
  }

  // Single value: number / date / text.
  const type =
    def.type === "number" ? "number" : def.type === "date" ? "date" : "text";
  return (
    <input
      type={type}
      value={rule.v[0] ?? ""}
      placeholder={def.type === "text" ? "value…" : undefined}
      onChange={(e) => onChange([e.target.value], false)}
      className={`w-56 ${inputClass}`}
    />
  );
}

/** Chips + an "add" dropdown for picking multiple values from a fixed set. */
function OptionMultiSelect({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const selected = new Set(value);
  const remaining = options.filter((o) => !selected.has(o.value));
  return (
    <span className="flex flex-wrap items-center gap-1">
      {value.map((v) => {
        const label = options.find((o) => o.value === v)?.label ?? v;
        return (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5"
          >
            {label}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
              aria-label={`Remove ${label}`}
            >
              ×
            </button>
          </span>
        );
      })}
      {remaining.length > 0 && (
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
        >
          <option value="">{value.length ? "Add…" : "Select…"}</option>
          {remaining.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
