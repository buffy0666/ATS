"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  activeSequencesForBulk,
  addCandidatesToJob,
  addCandidatesToList,
  addTagsToCandidates,
  bulkEditCandidates,
  choiceOptionsForBulk,
  createChoiceForBulk,
  createListForBulk,
  listsVisibleToCurrentUser,
  openJobsForBulk,
  removeCandidatesFromList,
  removeTagsFromCandidates,
  type BulkActionResult,
} from "./bulk-actions";
import { BULK_EDIT_FIELDS, type BulkEditFieldDef } from "./bulk-edit-fields";
import { enrollCandidatesInSequence } from "../sequences/actions";
import { TagInput } from "@/components/TagInput";
import { tagClass } from "@/lib/tag-colors";

type ListOption = { id: string; name: string; scope: "PERSONAL" | "SHARED"; ownerId: string };
type JobOption = { id: string; title: string };
type SequenceOption = { id: string; name: string };
type TagOption = { id: string; name: string; color: string };

type ModalKind = "list" | "job" | "tag" | "untag" | "sequence" | "edit" | null;

export function SelectionToolbar({
  selectedIds,
  onClear,
  onAfterAction,
  listId,
  availableTags,
}: {
  selectedIds: string[];
  onClear: () => void;
  onAfterAction: () => void;
  listId?: string;
  availableTags: TagOption[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalKind>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // Auto-clear the banner after a few seconds.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  function handleResult(r: BulkActionResult, clearAfter: boolean) {
    setBanner({ tone: r.ok ? "ok" : "err", text: r.message });
    if (r.ok && clearAfter) {
      onClear();
      onAfterAction();
      router.refresh();
    }
  }

  function removeFromList() {
    if (!listId) return;
    if (
      !confirm(
        `Remove ${selectedIds.length} candidate${selectedIds.length === 1 ? "" : "s"} from this list? They won't be deleted.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await removeCandidatesFromList(selectedIds, listId);
      handleResult(r, true);
    });
  }

  if (selectedIds.length === 0) return null;

  return (
    <>
      <div
        className="selection-shimmer-border fixed bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-full border-2 px-4 py-2 flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-900 shadow-xl"
        role="region"
        aria-label="Bulk actions"
      >
        <span className="font-medium px-2">
          {selectedIds.length} selected
        </span>
        <span className="text-zinc-300 dark:text-zinc-700">|</span>
        <ToolbarButton onClick={() => setModal("list")} disabled={pending}>
          Add to list…
        </ToolbarButton>
        <ToolbarButton onClick={() => setModal("job")} disabled={pending}>
          Associate with job…
        </ToolbarButton>
        <ToolbarButton onClick={() => setModal("tag")} disabled={pending}>
          Add tag…
        </ToolbarButton>
        <ToolbarButton onClick={() => setModal("untag")} disabled={pending}>
          Remove tag…
        </ToolbarButton>
        <ToolbarButton onClick={() => setModal("edit")} disabled={pending}>
          Edit fields…
        </ToolbarButton>
        <ToolbarButton onClick={() => setModal("sequence")} disabled={pending}>
          Enroll in sequence…
        </ToolbarButton>
        {selectedIds.length === 2 && (
          <ToolbarButton
            onClick={() =>
              router.push(`/candidates/merge?a=${selectedIds[0]}&b=${selectedIds[1]}`)
            }
            disabled={pending}
          >
            Merge…
          </ToolbarButton>
        )}
        {listId && (
          <ToolbarButton tone="danger" onClick={removeFromList} disabled={pending}>
            Remove from list
          </ToolbarButton>
        )}
        <span className="text-zinc-300 dark:text-zinc-700">|</span>
        <ToolbarButton onClick={onClear} disabled={pending}>
          Clear
        </ToolbarButton>
      </div>

      {banner && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-30 max-w-md rounded-md border px-4 py-2 text-sm shadow-lg ${
            banner.tone === "ok"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
              : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
          }`}
          role="status"
          aria-live="polite"
        >
          {banner.text}
        </div>
      )}

      {modal === "list" && (
        <AddToListModal
          onClose={() => setModal(null)}
          onResult={(r) => {
            handleResult(r, true);
            setModal(null);
          }}
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
        />
      )}
      {modal === "job" && (
        <AssociateWithJobModal
          onClose={() => setModal(null)}
          onResult={(r) => {
            handleResult(r, true);
            setModal(null);
          }}
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
        />
      )}
      {modal === "tag" && (
        <AddTagModal
          onClose={() => setModal(null)}
          onResult={(r) => {
            handleResult(r, true);
            setModal(null);
          }}
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
          availableTags={availableTags}
        />
      )}
      {modal === "untag" && (
        <RemoveTagModal
          onClose={() => setModal(null)}
          onResult={(r) => {
            handleResult(r, true);
            setModal(null);
          }}
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
          availableTags={availableTags}
        />
      )}
      {modal === "sequence" && (
        <EnrollInSequenceModal
          onClose={() => setModal(null)}
          onResult={(r) => {
            handleResult(r, true);
            setModal(null);
          }}
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
        />
      )}
      {modal === "edit" && (
        <EditFieldsModal
          onClose={() => setModal(null)}
          onResult={(r) => {
            handleResult(r, true);
            setModal(null);
          }}
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
        />
      )}
    </>
  );
}

function EditFieldsModal({
  onClose,
  onResult,
  selectedCount,
  selectedIds,
}: {
  onClose: () => void;
  onResult: (r: BulkActionResult) => void;
  selectedCount: number;
  selectedIds: string[];
}) {
  const [fieldKey, setFieldKey] = useState<string>(BULK_EDIT_FIELDS[0].key);
  const def: BulkEditFieldDef =
    BULK_EDIT_FIELDS.find((f) => f.key === fieldKey) ?? BULK_EDIT_FIELDS[0];

  // Single-value fields (enumSelect / choiceSelect / rating / bool).
  const [value, setValue] = useState<string>("");
  // Multi-value fields (enumMulti).
  const [values, setValues] = useState<string[]>([]);

  // choiceSelect options loaded from the ChoiceOption registry.
  const [choices, setChoices] = useState<{ id: string; name: string }[] | null>(null);
  const [addingChoice, setAddingChoice] = useState(false);
  const [newChoice, setNewChoice] = useState("");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reset the value state whenever the chosen field changes.
  useEffect(() => {
    setValue("");
    setValues([]);
    setError(null);
    setAddingChoice(false);
    setNewChoice("");
    setChoices(null);
    if (def.type === "choiceSelect" && def.choiceField) {
      choiceOptionsForBulk(def.choiceField).then((opts) => {
        setChoices(opts);
        if (opts.length > 0) setValue(opts[0].name);
      });
    } else if (def.type === "enumSelect" && def.options && def.options.length > 0) {
      setValue(def.options[0].value);
    } else if (def.type === "rating" && def.options && def.options.length > 0) {
      setValue(def.options[0].value);
    } else if (def.type === "bool") {
      setValue("true");
    }
  }, [def]);

  function addChoiceInline() {
    const name = newChoice.trim();
    if (!name || !def.choiceField) return;
    setError(null);
    startTransition(async () => {
      const r = await createChoiceForBulk(def.choiceField!, name);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setChoices((prev) => {
        const next = prev ? [...prev] : [];
        if (!next.some((o) => o.name === r.name)) next.push({ id: r.name, name: r.name });
        return next;
      });
      setValue(r.name);
      setAddingChoice(false);
      setNewChoice("");
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const r = await bulkEditCandidates(selectedIds, fieldKey, value, values);
      onResult(r);
    });
  }

  function toggleMulti(v: string) {
    setValues((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  const selectClass =
    "w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm";

  return (
    <ModalShell
      title={`Edit a field on ${selectedCount} candidate${selectedCount === 1 ? "" : "s"}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Field</label>
          <select
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value)}
            className={selectClass}
          >
            {BULK_EDIT_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">New value</label>

          {def.type === "enumSelect" && (
            <select value={value} onChange={(e) => setValue(e.target.value)} className={selectClass}>
              {def.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {def.nullable && <option value="__CLEAR__">— Clear —</option>}
            </select>
          )}

          {def.type === "choiceSelect" &&
            (choices === null ? (
              <p className="text-sm text-zinc-500">Loading options…</p>
            ) : addingChoice ? (
              <div className="flex items-center gap-2">
                <input
                  value={newChoice}
                  onChange={(e) => setNewChoice(e.target.value)}
                  placeholder={`New ${def.label.toLowerCase()}…`}
                  className={selectClass}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addChoiceInline();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addChoiceInline}
                  disabled={pending || !newChoice.trim()}
                  className="shrink-0 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingChoice(false);
                    setNewChoice("");
                  }}
                  className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className={selectClass}
                >
                  {choices.map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                  {def.nullable && <option value="__CLEAR__">— Clear —</option>}
                </select>
                <button
                  type="button"
                  onClick={() => setAddingChoice(true)}
                  className="shrink-0 rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  + New
                </button>
              </div>
            ))}

          {def.type === "enumMulti" && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
              {def.options?.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2 px-1.5 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-950 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={values.includes(o.value)}
                    onChange={() => toggleMulti(o.value)}
                  />
                  {o.label}
                </label>
              ))}
              <p className="px-1.5 pt-1 text-xs text-zinc-500">
                Replaces the existing selection. Leave all unchecked to clear it.
              </p>
            </div>
          )}

          {def.type === "rating" && (
            <select value={value} onChange={(e) => setValue(e.target.value)} className={selectClass}>
              {def.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="__CLEAR__">— Clear —</option>
            </select>
          )}

          {def.type === "bool" && (
            <select value={value} onChange={(e) => setValue(e.target.value)} className={selectClass}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          )}
        </div>

        <p className="text-xs text-zinc-500">
          This sets <strong>{def.label}</strong> to the chosen value on all{" "}
          {selectedCount} selected candidate{selectedCount === 1 ? "" : "s"}, overwriting
          any current value.
        </p>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <ModalFooter
          onClose={onClose}
          onSubmit={submit}
          pending={pending}
          submitLabel="Apply"
        />
      </div>
    </ModalShell>
  );
}

function EnrollInSequenceModal({
  onClose,
  onResult,
  selectedCount,
  selectedIds,
}: {
  onClose: () => void;
  onResult: (r: BulkActionResult) => void;
  selectedCount: number;
  selectedIds: string[];
}) {
  const [sequences, setSequences] = useState<SequenceOption[] | null>(null);
  const [selectedSequenceId, setSelectedSequenceId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    activeSequencesForBulk().then((s) => {
      setSequences(s);
      if (s.length > 0) setSelectedSequenceId(s[0].id);
    });
  }, []);

  function submit() {
    setError(null);
    if (!selectedSequenceId) {
      setError("Pick a sequence.");
      return;
    }
    startTransition(async () => {
      const r = await enrollCandidatesInSequence(selectedIds, selectedSequenceId);
      onResult({
        ok: r.ok,
        message: r.message,
        affected: r.enrolled,
        alreadyPresent: r.alreadyEnrolled,
      });
    });
  }

  return (
    <ModalShell
      title={`Enroll ${selectedCount} candidate${selectedCount === 1 ? "" : "s"} in a sequence`}
      onClose={onClose}
    >
      {sequences === null ? (
        <p className="text-sm text-zinc-500">Loading sequences…</p>
      ) : sequences.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No active sequences. Create one at /sequences first.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
              Sequence
            </span>
            <select
              value={selectedSequenceId}
              onChange={(e) => setSelectedSequenceId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            >
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-zinc-500">
            Each candidate&apos;s step runs are scheduled from now. Candidates already enrolled
            in this sequence are skipped.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <ModalFooter
            onClose={onClose}
            onSubmit={submit}
            pending={pending}
            submitLabel="Enroll"
          />
        </div>
      )}
    </ModalShell>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}) {
  const base =
    "rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
  const cls =
    tone === "danger"
      ? `${base} text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30`
      : `${base} text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800`;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function AddToListModal({
  onClose,
  onResult,
  selectedCount,
  selectedIds,
}: {
  onClose: () => void;
  onResult: (r: BulkActionResult) => void;
  selectedCount: number;
  selectedIds: string[];
}) {
  const [lists, setLists] = useState<ListOption[] | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedListId, setSelectedListId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listsVisibleToCurrentUser().then((ls) => {
      setLists(ls);
      if (ls.length === 0) setMode("new");
      else setSelectedListId(ls[0].id);
    });
  }, []);

  function submit() {
    setError(null);
    startTransition(async () => {
      let targetId = selectedListId;
      if (mode === "new") {
        const created = await createListForBulk(newName, newDescription);
        if ("error" in created) {
          setError(created.error);
          return;
        }
        targetId = created.id;
      }
      if (!targetId) {
        setError("Pick or create a list.");
        return;
      }
      const r = await addCandidatesToList(selectedIds, targetId);
      onResult(r);
    });
  }

  return (
    <ModalShell title={`Add ${selectedCount} candidate${selectedCount === 1 ? "" : "s"} to a list`} onClose={onClose}>
      {lists === null ? (
        <p className="text-sm text-zinc-500">Loading lists…</p>
      ) : (
        <div className="space-y-4">
          {lists.length > 0 && (
            <div className="flex gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "existing"}
                  onChange={() => setMode("existing")}
                />
                Existing list
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "new"}
                  onChange={() => setMode("new")}
                />
                New list
              </label>
            </div>
          )}

          {mode === "existing" && lists.length > 0 ? (
            <div>
              <label className="mb-1 block text-sm font-medium">List</label>
              <select
                value={selectedListId}
                onChange={(e) => setSelectedListId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.scope === "SHARED" ? "· shared" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium">New list name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Active Engineering"
                maxLength={120}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
                autoFocus
              />
              <label className="mb-1 mt-3 block text-sm font-medium">Description</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="What this list is for (optional)…"
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-zinc-500">Creates a personal list owned by you.</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <ModalFooter onClose={onClose} onSubmit={submit} pending={pending} submitLabel="Add to list" />
        </div>
      )}
    </ModalShell>
  );
}

function AssociateWithJobModal({
  onClose,
  onResult,
  selectedCount,
  selectedIds,
}: {
  onClose: () => void;
  onResult: (r: BulkActionResult) => void;
  selectedCount: number;
  selectedIds: string[];
}) {
  const [jobs, setJobs] = useState<JobOption[] | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openJobsForBulk().then((js) => {
      setJobs(js);
      if (js.length > 0) setSelectedJobId(js[0].id);
    });
  }, []);

  const visibleJobs = (jobs ?? []).filter((j) =>
    j.title.toLowerCase().includes(filter.toLowerCase()),
  );

  function submit() {
    setError(null);
    if (!selectedJobId) {
      setError("Pick a job.");
      return;
    }
    startTransition(async () => {
      const r = await addCandidatesToJob(selectedIds, selectedJobId);
      onResult(r);
    });
  }

  return (
    <ModalShell
      title={`Associate ${selectedCount} candidate${selectedCount === 1 ? "" : "s"} with a job`}
      onClose={onClose}
    >
      {jobs === null ? (
        <p className="text-sm text-zinc-500">Loading jobs…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-zinc-500">No open jobs to associate with.</p>
      ) : (
        <div className="space-y-3">
          <input
            type="search"
            placeholder="Filter jobs…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
          />
          <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            {visibleJobs.length === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-500">No jobs match.</p>
            ) : (
              <ul>
                {visibleJobs.map((j) => (
                  <li key={j.id}>
                    <label className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-950 cursor-pointer">
                      <input
                        type="radio"
                        name="jobId"
                        checked={selectedJobId === j.id}
                        onChange={() => setSelectedJobId(j.id)}
                      />
                      {j.title}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-zinc-500">
            New applications start at stage Applied. Candidates already on this job are
            skipped.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <ModalFooter
            onClose={onClose}
            onSubmit={submit}
            pending={pending}
            submitLabel="Associate"
          />
        </div>
      )}
    </ModalShell>
  );
}

function AddTagModal({
  onClose,
  onResult,
  selectedCount,
  selectedIds,
  availableTags,
}: {
  onClose: () => void;
  onResult: (r: BulkActionResult) => void;
  selectedCount: number;
  selectedIds: string[];
  availableTags: TagOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    const tagNames = formData.getAll("tags").map(String).filter(Boolean);
    if (tagNames.length === 0) {
      setError("Add at least one tag.");
      return;
    }
    startTransition(async () => {
      const r = await addTagsToCandidates(selectedIds, tagNames);
      onResult(r);
    });
  }

  return (
    <ModalShell
      title={`Tag ${selectedCount} candidate${selectedCount === 1 ? "" : "s"}`}
      onClose={onClose}
    >
      <form action={submit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Tags</label>
          <TagInput allTags={availableTags} />
          <p className="mt-1 text-xs text-zinc-500">
            Existing tags are reused; new tags are created on the fly.
          </p>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Tagging…" : "Add tags"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function RemoveTagModal({
  onClose,
  onResult,
  selectedCount,
  selectedIds,
  availableTags,
}: {
  onClose: () => void;
  onResult: (r: BulkActionResult) => void;
  selectedCount: number;
  selectedIds: string[];
  availableTags: TagOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const visible = query.trim()
    ? availableTags.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : availableTags;

  function toggle(id: string) {
    setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function submit() {
    setError(null);
    if (chosen.length === 0) {
      setError("Pick at least one tag to remove.");
      return;
    }
    startTransition(async () => {
      const r = await removeTagsFromCandidates(selectedIds, chosen);
      onResult(r);
    });
  }

  return (
    <ModalShell
      title={`Remove tags from ${selectedCount} candidate${selectedCount === 1 ? "" : "s"}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Tags to remove</label>
          {availableTags.length > 8 && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tags…"
              className="mb-2 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm focus:outline-none"
            />
          )}
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800 p-2">
            {visible.length === 0 && (
              <p className="text-sm text-zinc-500">No tags match.</p>
            )}
            {visible.map((t) => {
              const active = chosen.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className={`rounded-full px-2 py-0.5 text-xs transition ${tagClass(t.color)} ${
                    active
                      ? "ring-2 ring-red-500 line-through"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  title={active ? "Will be removed — click to keep" : "Click to remove this tag"}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Click tags to mark them for removal. Candidates that don&apos;t have a chosen tag are
            unaffected; the tags themselves stay available for reuse.
          </p>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <ModalFooter
          onClose={onClose}
          onSubmit={submit}
          pending={pending}
          submitLabel={
            chosen.length > 0
              ? `Remove ${chosen.length} tag${chosen.length === 1 ? "" : "s"}`
              : "Remove tags"
          }
        />
      </div>
    </ModalShell>
  );
}

function ModalFooter({
  onClose,
  onSubmit,
  pending,
  submitLabel,
}: {
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending}
        className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
      >
        {pending ? "Working…" : submitLabel}
      </button>
    </div>
  );
}
