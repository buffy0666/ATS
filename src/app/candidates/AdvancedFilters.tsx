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
  listOptions = [],
  jobOptions = [],
  sequenceOptions = [],
}: {
  availableTags: TagOption[];
  sourceOptions: ChoiceOption[];
  seniorityOptions: ChoiceOption[];
  listOptions?: { id: string; name: string }[];
  jobOptions?: { id: string; title: string }[];
  sequenceOptions?: { id: string; name: string }[];
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

  function clearAll() {
    const next = new URLSearchParams(params.toString());
    for (const key of ADVANCED_FILTER_KEYS) next.delete(key);
    pushNext(next);
  }

  // Count only the actual filter groups — not the separate filter-builder
  // param (`fb`), which lives in its own panel.
  const activeCount = ADVANCED_FILTER_KEYS.filter(
    (k) => k !== "fb" && (params.get(k) ?? "").length > 0,
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
              notParamKey="notStatus"
              params={params}
              options={STATUS_OPTIONS.map((v) => ({
                value: v,
                label: CANDIDATE_STATUS_LABEL[v] ?? v.replace(/_/g, " "),
              }))}
              onToggle={toggleMultiValue}
            />
            <MultiSelectGroup
              label="Source"
              paramKey="source"
              notParamKey="notSource"
              params={params}
              options={sourceOptions.map((o) => ({ value: o.name, label: o.name }))}
              onToggle={toggleMultiValue}
              emptyMessage="No sources defined — add some in Settings."
            />
            <MultiSelectGroup
              label="Tags"
              paramKey="tag"
              notParamKey="notTag"
              params={params}
              options={availableTags.map((t) => ({ value: t.name, label: t.name }))}
              onToggle={toggleMultiValue}
              emptyMessage="No tags yet."
            />
            <MultiSelectGroup
              label="Work authorization"
              paramKey="workAuth"
              notParamKey="notWorkAuth"
              params={params}
              options={WORK_AUTH_OPTIONS.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))}
              onToggle={toggleMultiValue}
            />
            <MultiSelectGroup
              label="Seniority"
              paramKey="seniority"
              notParamKey="notSeniority"
              params={params}
              options={seniorityOptions.map((o) => ({ value: o.name, label: o.name }))}
              onToggle={toggleMultiValue}
              emptyMessage="No seniority levels defined — add some in Settings."
            />
            <MultiSelectGroup
              label="Remote preference"
              paramKey="remotePref"
              notParamKey="notRemotePref"
              params={params}
              options={REMOTE_PREF_OPTIONS.map((v) => ({ value: v, label: v.replace(/_/g, " ") }))}
              onToggle={toggleMultiValue}
            />
            <MultiSelectGroup
              label="Employment type"
              paramKey="employmentType"
              notParamKey="notEmploymentType"
              params={params}
              options={EMPLOYMENT_TYPE_OPTIONS.map((v) => ({
                value: v,
                label: v.replace(/_/g, " "),
              }))}
              onToggle={toggleMultiValue}
            />
            <MultiSelectGroup
              label="Lists"
              paramKey="inLists"
              notParamKey="notInLists"
              params={params}
              options={listOptions.map((l) => ({ value: l.id, label: l.name }))}
              onToggle={toggleMultiValue}
              emptyMessage="No lists yet."
              includeLabel="On"
              excludeLabel="Not on"
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
            <PresenceGroup params={params} onChange={setParam} />
            <ComplianceGroup params={params} onChange={setParam} />
            <PipelineExcludeGroup
              params={params}
              onChange={setParam}
              jobOptions={jobOptions}
              sequenceOptions={sequenceOptions}
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
  notParamKey,
  params,
  options,
  onToggle,
  emptyMessage,
  includeLabel = "Is",
  excludeLabel = "Is not",
}: {
  label: string;
  paramKey: string;
  /** Mirror param for exclusion. When set, an Is/Is-not toggle is shown and
   *  checkboxes write to whichever mode is active. */
  notParamKey?: string;
  params: URLSearchParams;
  options: { value: string; label: string }[];
  onToggle: (key: string, value: string) => void;
  emptyMessage?: string;
  includeLabel?: string;
  excludeLabel?: string;
}) {
  // Mode is "exclude" if the exclusion param has any value AND the include
  // param doesn't — so reopening the panel reflects how it was last used.
  const includeSel = new Set(parseMultiValue(params.get(paramKey)));
  const excludeSel = notParamKey ? new Set(parseMultiValue(params.get(notParamKey))) : new Set<string>();
  const initialMode: "include" | "exclude" =
    notParamKey && excludeSel.size > 0 && includeSel.size === 0 ? "exclude" : "include";
  const [mode, setMode] = useState<"include" | "exclude">(initialMode);

  const activeKey = mode === "exclude" && notParamKey ? notParamKey : paramKey;
  const selected = mode === "exclude" && notParamKey ? excludeSel : includeSel;

  return (
    <fieldset>
      <div className="flex items-center justify-between mb-1.5">
        <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </legend>
        {notParamKey && (
          <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden text-[10px]">
            <button
              type="button"
              onClick={() => setMode("include")}
              className={`px-1.5 py-0.5 ${
                mode === "include"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {includeLabel}
            </button>
            <button
              type="button"
              onClick={() => setMode("exclude")}
              className={`px-1.5 py-0.5 ${
                mode === "exclude"
                  ? "bg-red-600 text-white dark:bg-red-500"
                  : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {excludeLabel}
            </button>
          </div>
        )}
      </div>
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
                onChange={() => onToggle(activeKey, opt.value)}
                className={`rounded border-zinc-300 dark:border-zinc-700 ${
                  mode === "exclude" ? "accent-red-600" : ""
                }`}
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

// Tri-state presence control: Any / Has / Missing.
function PresenceRow({
  label,
  paramKey,
  params,
  onChange,
}: {
  label: string;
  paramKey: string;
  params: URLSearchParams;
  onChange: (key: string, value: string | null) => void;
}) {
  const val = params.get(paramKey); // "true" | "false" | null
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-zinc-700 dark:text-zinc-300">
      <span>{label}</span>
      <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-700 overflow-hidden text-[10px]">
        {([
          ["Any", null],
          ["Has", "true"],
          ["Missing", "false"],
        ] as const).map(([lbl, v]) => (
          <button
            key={lbl}
            type="button"
            onClick={() => onChange(paramKey, v)}
            className={`px-1.5 py-0.5 ${
              (val ?? null) === v
                ? v === "false"
                  ? "bg-red-600 text-white dark:bg-red-500"
                  : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

function PresenceGroup({
  params,
  onChange,
}: {
  params: URLSearchParams;
  onChange: (key: string, value: string | null) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1.5">
        Has / missing
      </legend>
      <PresenceRow label="Email" paramKey="hasEmail" params={params} onChange={onChange} />
      <PresenceRow label="Phone" paramKey="hasPhone" params={params} onChange={onChange} />
      <PresenceRow label="LinkedIn" paramKey="hasLinkedin" params={params} onChange={onChange} />
    </fieldset>
  );
}

function ComplianceGroup({
  params,
  onChange,
}: {
  params: URLSearchParams;
  onChange: (key: string, value: string | null) => void;
}) {
  const items: { key: string; label: string }[] = [
    { key: "exDoNotContact", label: "Exclude Do Not Contact" },
    { key: "exUnsubscribed", label: "Exclude unsubscribed" },
    { key: "exBlacklisted", label: "Exclude do-not-submit (internal block)" },
    { key: "exPlaced", label: "Exclude placed" },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1.5">
        Compliance
      </legend>
      {items.map((it) => (
        <label
          key={it.key}
          className="flex items-center gap-2 text-xs cursor-pointer text-zinc-700 dark:text-zinc-300"
        >
          <input
            type="checkbox"
            checked={params.get(it.key) === "true"}
            onChange={(e) => onChange(it.key, e.target.checked ? "true" : null)}
            className="rounded border-zinc-300 dark:border-zinc-700 accent-red-600"
          />
          <span>{it.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function PipelineExcludeGroup({
  params,
  onChange,
  jobOptions,
  sequenceOptions,
}: {
  params: URLSearchParams;
  onChange: (key: string, value: string | null) => void;
  jobOptions: { id: string; title: string }[];
  sequenceOptions: { id: string; name: string }[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1.5">
        Exclude from pipeline
      </legend>
      <label className="block text-xs text-zinc-700 dark:text-zinc-300">
        <span className="block mb-1">Not already on job</span>
        <select
          value={params.get("notOnJob") ?? ""}
          onChange={(e) => onChange("notOnJob", e.target.value || null)}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
        >
          <option value="">— Any —</option>
          {jobOptions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-zinc-700 dark:text-zinc-300">
        <span className="block mb-1">Not already in sequence</span>
        <select
          value={params.get("notInSequence") ?? ""}
          onChange={(e) => onChange("notInSequence", e.target.value || null)}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
        >
          <option value="">— Any —</option>
          {sequenceOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
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
