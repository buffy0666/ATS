"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CandidateStatus,
  EmploymentType,
  RemotePref,
  WorkAuth,
} from "@/generated/prisma";
import { CANDIDATE_STATUS_LABEL } from "@/lib/candidate-status";
import {
  ADVANCED_FILTER_KEYS,
  hasAnyAdvancedFilter,
  isExcluded,
  negateKey,
  parseMultiValue,
  serializeMultiValue,
} from "./search-params";

type TagOption = { id: string; name: string; color: string };
type ChoiceOption = { id: string; name: string };

const STATUS_OPTIONS = Object.values(CandidateStatus);
const WORK_AUTH_OPTIONS = Object.values(WorkAuth);
const REMOTE_PREF_OPTIONS = Object.values(RemotePref);
const EMPLOYMENT_TYPE_OPTIONS = Object.values(EmploymentType);

export function AdvancedFilters({
  availableTags,
  sourceOptions,
  seniorityOptions,
}: {
  availableTags: TagOption[];
  sourceOptions: ChoiceOption[];
  seniorityOptions: ChoiceOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => hasAnyAdvancedFilter(searchParams));

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  function pushNext(next: URLSearchParams) {
    const qs = next.toString();
    router.push(`/candidates${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    pushNext(next);
  }

  function toggleMultiValue(key: string, value: string) {
    const current = parseMultiValue(params.get(key));
    const has = current.includes(value);
    const updated = has ? current.filter((v) => v !== value) : [...current, value];
    setParam(key, serializeMultiValue(updated));
  }

  // Flip a multi-select between "match any of" (include) and "match none of"
  // (exclude) by toggling its `<key>_op=exclude` companion param.
  function toggleExclude(key: string, next: boolean) {
    const params2 = new URLSearchParams(params.toString());
    if (next) params2.set(negateKey(key), "exclude");
    else params2.delete(negateKey(key));
    pushNext(params2);
  }

  function clearAll() {
    const next = new URLSearchParams(params.toString());
    for (const key of ADVANCED_FILTER_KEYS) next.delete(key);
    pushNext(next);
  }

  // Count only the actual filter groups — not their `_op` negate companions or
  // the separate filter-builder param (`fb`), which live in their own panels.
  const activeCount = ADVANCED_FILTER_KEYS.filter(
    (k) => !k.endsWith("_op") && k !== "fb" && (params.get(k) ?? "").length > 0,
  ).length;

  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span>
          Advanced filters{activeCount > 0 ? ` (${activeCount} active)` : ""}
        </span>
        <span className="text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <MultiSelectGroup
              label="Status"
              paramKey="status"
              params={params}
              options={STATUS_OPTIONS.map((v) => ({
                value: v,
                label: CANDIDATE_STATUS_LABEL[v] ?? v.replace(/_/g, " "),
              }))}
              onToggle={toggleMultiValue}
              onToggleExclude={toggleExclude}
            />
            <MultiSelectGroup
              label="Source"
              paramKey="source"
              params={params}
              options={sourceOptions.map((o) => ({ value: o.name, label: o.name }))}
              onToggle={toggleMultiValue}
              onToggleExclude={toggleExclude}
              emptyMessage="No sources defined — add some in Settings."
            />
            <MultiSelectGroup
              label="Tags"
              paramKey="tag"
              params={params}
              options={availableTags.map((t) => ({ value: t.name, label: t.name }))}
              onToggle={toggleMultiValue}
              onToggleExclude={toggleExclude}
              emptyMessage="No tags yet."
            />
            <MultiSelectGroup
              label="Work authorization"
              paramKey="workAuth"
              params={params}
              options={WORK_AUTH_OPTIONS.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))}
              onToggle={toggleMultiValue}
              onToggleExclude={toggleExclude}
            />
            <MultiSelectGroup
              label="Seniority"
              paramKey="seniority"
              params={params}
              options={seniorityOptions.map((o) => ({ value: o.name, label: o.name }))}
              onToggle={toggleMultiValue}
              onToggleExclude={toggleExclude}
              emptyMessage="No seniority levels defined — add some in Settings."
            />
            <MultiSelectGroup
              label="Remote preference"
              paramKey="remotePref"
              params={params}
              options={REMOTE_PREF_OPTIONS.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))}
              onToggle={toggleMultiValue}
              onToggleExclude={toggleExclude}
            />
            <MultiSelectGroup
              label="Employment type"
              paramKey="employmentType"
              params={params}
              options={EMPLOYMENT_TYPE_OPTIONS.map((v) => ({
                value: v,
                label: v.replace(/_/g, " "),
              }))}
              onToggle={toggleMultiValue}
              onToggleExclude={toggleExclude}
            />
            <RangeGroup
              label="Years experience"
              minKey="yearsMin"
              maxKey="yearsMax"
              params={params}
              onChange={setParam}
            />
            <RangeGroup
              label="Desired salary"
              minKey="salaryMin"
              maxKey="salaryMax"
              params={params}
              step={1000}
              onChange={setParam}
            />
            <BooleanGroup params={params} onChange={setParam} />
          </div>

          {activeCount > 0 && (
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
              >
                Clear all advanced filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MultiSelectGroup({
  label,
  paramKey,
  params,
  options,
  onToggle,
  onToggleExclude,
  emptyMessage,
}: {
  label: string;
  paramKey: string;
  params: URLSearchParams;
  options: { value: string; label: string }[];
  onToggle: (key: string, value: string) => void;
  onToggleExclude?: (key: string, next: boolean) => void;
  emptyMessage?: string;
}) {
  const selected = new Set(parseMultiValue(params.get(paramKey)));
  const excluded = isExcluded(params, paramKey);
  return (
    <fieldset>
      <legend className="mb-1.5 w-full">
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {label}
          </span>
          {onToggleExclude && (
            <button
              type="button"
              onClick={() => onToggleExclude(paramKey, !excluded)}
              title={
                excluded
                  ? "Excluding the checked values — click to include instead"
                  : "Including the checked values — click to exclude instead"
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                excluded
                  ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {excluded ? "Exclude" : "Include"}
            </button>
          )}
        </span>
      </legend>
      {options.length === 0 ? (
        <p className="text-xs text-zinc-400">{emptyMessage ?? "—"}</p>
      ) : (
        <div className="max-h-40 overflow-y-auto pr-1 space-y-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 text-xs cursor-pointer text-zinc-700 dark:text-zinc-300"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => onToggle(paramKey, opt.value)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function RangeGroup({
  label,
  minKey,
  maxKey,
  params,
  step,
  onChange,
}: {
  label: string;
  minKey: string;
  maxKey: string;
  params: URLSearchParams;
  step?: number;
  onChange: (key: string, value: string | null) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1.5">
        {label}
      </legend>
      <div className="flex items-center gap-2 text-xs">
        <input
          type="number"
          min={0}
          step={step ?? 1}
          placeholder="Min"
          defaultValue={params.get(minKey) ?? ""}
          onBlur={(e) => onChange(minKey, e.target.value.trim() || null)}
          className="w-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
        />
        <span className="text-zinc-400">–</span>
        <input
          type="number"
          min={0}
          step={step ?? 1}
          placeholder="Max"
          defaultValue={params.get(maxKey) ?? ""}
          onBlur={(e) => onChange(maxKey, e.target.value.trim() || null)}
          className="w-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
        />
      </div>
    </fieldset>
  );
}

function BooleanGroup({
  params,
  onChange,
}: {
  params: URLSearchParams;
  onChange: (key: string, value: string | null) => void;
}) {
  const hasResume = params.get("hasResume") === "true";

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1.5">
        Other
      </legend>
      <label className="flex items-center gap-2 text-xs cursor-pointer text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={hasResume}
          onChange={(e) => onChange("hasResume", e.target.checked ? "true" : null)}
          className="rounded border-zinc-300 dark:border-zinc-700"
        />
        <span>Has resume on file</span>
      </label>
      <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
        <span>Not contacted in</span>
        <input
          type="number"
          min={0}
          placeholder="N"
          defaultValue={params.get("lastContactedDays") ?? ""}
          onBlur={(e) => onChange("lastContactedDays", e.target.value.trim() || null)}
          className="w-16 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1"
        />
        <span>days</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
        <span>Added in last</span>
        <input
          type="number"
          min={0}
          placeholder="N"
          defaultValue={params.get("addedDays") ?? ""}
          onBlur={(e) => onChange("addedDays", e.target.value.trim() || null)}
          className="w-16 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1"
        />
        <span>days</span>
      </div>
    </fieldset>
  );
}
