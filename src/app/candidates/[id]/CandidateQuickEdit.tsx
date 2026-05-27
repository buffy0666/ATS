"use client";

import { useActionState, useState } from "react";
import { EmploymentType, RemotePref, WorkAuth } from "@/generated/prisma";
import {
  updateCandidateQuickFields,
  type QuickEditResult,
} from "./quick-edit-actions";

const WORK_AUTH_LABEL: Record<WorkAuth, string> = {
  US_CITIZEN: "U.S. citizen",
  GREEN_CARD: "Green card / permanent resident",
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

export type QuickEditCandidate = {
  id: string;
  workAuthorization: WorkAuth | null;
  requiresSponsorship: boolean;
  githubUrl: string | null;
  portfolioUrl: string | null;
  employmentTypePref: EmploymentType[];
  remotePref: RemotePref[];
};

export function CandidateQuickEdit({ candidate }: { candidate: QuickEditCandidate }) {
  const action = updateCandidateQuickFields.bind(null, candidate.id);
  const [state, formAction, pending] = useActionState<QuickEditResult | undefined, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Quick edit
        </h2>
        {state && (
          <span
            className={`text-xs ${
              state.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
            aria-live="polite"
          >
            {state.ok ? state.message : state.error}
          </span>
        )}
      </div>

      <Expander label="Work authorization & sponsorship">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Work authorization
          </span>
          <select
            name="workAuthorization"
            defaultValue={candidate.workAuthorization ?? ""}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">— Unknown —</option>
            {(Object.keys(WORK_AUTH_LABEL) as WorkAuth[]).map((k) => (
              <option key={k} value={k}>
                {WORK_AUTH_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="requiresSponsorship"
            value="true"
            defaultChecked={candidate.requiresSponsorship}
            className="rounded border-zinc-300 dark:border-zinc-700"
          />
          Requires visa sponsorship
        </label>
      </Expander>

      <Expander label="GitHub & portfolio">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            GitHub URL
          </span>
          <input
            name="githubUrl"
            defaultValue={candidate.githubUrl ?? ""}
            placeholder="https://github.com/…"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Portfolio / website
          </span>
          <input
            name="portfolioUrl"
            defaultValue={candidate.portfolioUrl ?? ""}
            placeholder="https://…"
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
        </label>
      </Expander>

      <Expander label="Employment type & work mode">
        <CheckboxGroup
          legend="Employment type preference"
          name="employmentTypePref"
          selected={candidate.employmentTypePref}
          options={(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((k) => ({
            value: k,
            label: EMPLOYMENT_TYPE_LABEL[k],
          }))}
        />
        <CheckboxGroup
          legend="Work mode preference"
          name="remotePref"
          selected={candidate.remotePref}
          options={(Object.keys(REMOTE_PREF_LABEL) as RemotePref[]).map((k) => ({
            value: k,
            label: REMOTE_PREF_LABEL[k],
          }))}
        />
      </Expander>

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Expander({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group inline-flex items-center gap-2.5 rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:border-indigo-400 hover:text-indigo-600 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
      >
        <span
          className={`grid h-5 w-5 place-items-center rounded-full bg-indigo-400 dark:bg-indigo-500 text-white shadow-sm transition-transform duration-300 ease-out ${
            open ? "rotate-45" : "rotate-0"
          }`}
        >
          <svg
            viewBox="0 0 14 14"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
          >
            <path d="M7 1.5v11M1.5 7h11" />
          </svg>
        </span>
        {label}
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function CheckboxGroup({
  legend,
  name,
  options,
  selected,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  selected: string[];
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {options.map((opt) => (
          <label key={opt.value} className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={opt.value}
              defaultChecked={selected.includes(opt.value)}
              className="rounded border-zinc-300 dark:border-zinc-700"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
