"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { JOB_TYPES } from "./constants";
import { deleteJobContract } from "./actions";

export type HiringManagerInput = {
  name: string;
  email: string;
  phone: string;
  chat: string;
  comments: string;
};

export type ExistingContract = {
  id: string;
  name: string;
  url: string;
  size: number;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm";

/**
 * The job-form fields that go beyond the basics: Hiring Managers (repeatable),
 * Hiring Process (textarea), Job Type (select), and Contracts (attachments).
 *
 * Used by both the create and edit forms. On create there are no existing
 * contracts; on edit, `existingContracts` lists already-uploaded files with a
 * Remove button (server action), and `jobId` enables that removal.
 *
 * Hiring managers are serialized into a single hidden "hiringManagers" JSON
 * field so the server action can parse the whole list at once. New contract
 * files are appended to the form's FormData under "contract" on submit.
 */
export function JobExtraFields({
  jobId,
  defaultHiringProcess,
  defaultJobType,
  defaultManagers,
  existingContracts = [],
  formId,
}: {
  jobId?: string;
  defaultHiringProcess?: string | null;
  defaultJobType?: string | null;
  defaultManagers?: HiringManagerInput[];
  existingContracts?: ExistingContract[];
  /** id of the <form> these fields submit with, so the hidden inputs + file
   *  list can be appended on submit by the parent. Not strictly needed —
   *  hidden inputs live inside the form already. */
  formId?: string;
}) {
  const router = useRouter();
  const [managers, setManagers] = useState<HiringManagerInput[]>(
    defaultManagers && defaultManagers.length > 0
      ? defaultManagers
      : [{ name: "", email: "", phone: "", chat: "", comments: "" }],
  );
  const [contractFiles, setContractFiles] = useState<File[]>([]);
  const contractInputRef = useRef<HTMLInputElement>(null);
  const [removing, startRemove] = useTransition();

  function updateManager(i: number, field: keyof HiringManagerInput, value: string) {
    setManagers((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  }
  function addManager() {
    setManagers((prev) => [...prev, { name: "", email: "", phone: "", chat: "", comments: "" }]);
  }
  function removeManager(i: number) {
    setManagers((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function addContractFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setContractFiles((prev) => {
      const next = [...prev];
      for (const f of Array.from(picked)) {
        if (!next.some((e) => e.name === f.name && e.size === f.size)) next.push(f);
      }
      return next;
    });
    if (contractInputRef.current) contractInputRef.current.value = "";
  }
  function removeStagedContract(i: number) {
    setContractFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  function removeExistingContract(contractId: string, name: string) {
    if (!jobId) return;
    if (!confirm(`Remove "${name}"? This can't be undone.`)) return;
    startRemove(async () => {
      await deleteJobContract(contractId);
      router.refresh();
    });
  }

  // Only the non-empty managers are submitted. Serialized to JSON in a hidden
  // input the server action reads.
  const managersPayload = JSON.stringify(
    managers
      .map((m) => ({
        name: m.name.trim(),
        email: m.email.trim(),
        phone: m.phone.trim(),
        chat: m.chat.trim(),
        comments: m.comments.trim(),
      }))
      .filter((m) => m.name || m.email || m.phone || m.chat || m.comments),
  );

  return (
    <>
      {/* Hidden field carrying the serialized hiring-manager list. */}
      <input type="hidden" name="hiringManagers" value={managersPayload} />

      {/* Staged contract files are added to the form via a ref on submit.
          We rely on the parent form reading them through this component's
          hidden file inputs below. */}

      {/* --- Hiring Managers --- */}
      <fieldset className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Hiring managers
        </legend>
        {managers.map((m, i) => (
          <div
            key={i}
            className="rounded-md border border-zinc-200 dark:border-zinc-800 p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">
                Hiring manager {i + 1}
              </span>
              {managers.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeManager(i)}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={m.name}
                onChange={(e) => updateManager(i, "name", e.target.value)}
                placeholder="Name"
                className={inputClass}
              />
              <input
                value={m.email}
                onChange={(e) => updateManager(i, "email", e.target.value)}
                placeholder="Email"
                type="email"
                className={inputClass}
              />
              <input
                value={m.phone}
                onChange={(e) => updateManager(i, "phone", e.target.value)}
                placeholder="Phone"
                className={inputClass}
              />
              <input
                value={m.chat}
                onChange={(e) => updateManager(i, "chat", e.target.value)}
                placeholder="Chat (Teams/Slack handle or link)"
                className={inputClass}
              />
            </div>
            <textarea
              value={m.comments}
              onChange={(e) => updateManager(i, "comments", e.target.value)}
              placeholder="Comments (preferences, availability, notes about this hiring manager)…"
              rows={2}
              className="w-full resize-y rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm leading-relaxed"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addManager}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          + Add hiring manager
        </button>
      </fieldset>

      {/* --- Hiring Process --- */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="hiringProcess">
          Hiring process
        </label>
        <textarea
          id="hiringProcess"
          name="hiringProcess"
          rows={5}
          defaultValue={defaultHiringProcess ?? ""}
          placeholder="Steps, interview loop, decision makers, timeline…"
          className="w-full resize-y rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
        />
      </div>

      {/* --- Job Type --- */}
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="jobType">
          Job type
        </label>
        <select
          id="jobType"
          name="jobType"
          defaultValue={defaultJobType ?? JOB_TYPES[1]}
          className="w-full sm:w-48 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
        >
          {JOB_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* --- Contracts --- */}
      <fieldset className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Contracts
        </legend>

        {existingContracts.length > 0 && (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
            {existingContracts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {c.name}
                </a>
                <button
                  type="button"
                  onClick={() => removeExistingContract(c.id, c.name)}
                  disabled={removing}
                  className="shrink-0 rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {contractFiles.length > 0 && (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-800">
            {contractFiles.map((f, i) => (
              <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{f.name}</div>
                  <div className="text-xs text-zinc-500">{formatBytes(f.size)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => removeStagedContract(i)}
                  className="shrink-0 rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* The staged files are mirrored into real form inputs so they submit
            with the form. We keep a DataTransfer-backed hidden input in sync. */}
        <ContractFileInputs files={contractFiles} />

        <input
          ref={contractInputRef}
          type="file"
          multiple
          onChange={(e) => addContractFiles(e.target.files)}
          className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700"
        />
        <p className="text-xs text-zinc-500">
          PDF, DOC/DOCX, XLS/XLSX, CSV, TXT, or images up to 20MB each. Choose more to add to the list.
        </p>
      </fieldset>
    </>
  );
}

/**
 * Bridges the React-managed file list into a real <input type="file"> so the
 * files are part of the native form submission. A DataTransfer is rebuilt
 * whenever the list changes and assigned to the hidden input's .files.
 */
function ContractFileInputs({ files }: { files: File[] }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    ref.current.files = dt.files;
  }, [files]);

  return (
    <input
      ref={ref}
      type="file"
      name="contract"
      multiple
      hidden
      tabIndex={-1}
      aria-hidden
    />
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
