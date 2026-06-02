"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListScope } from "@/generated/prisma";
import { deleteList, updateList } from "../actions";
import { EnrollListInSequenceButton } from "./EnrollListInSequenceButton";
import { EntityMultiSelect, type EntityOption } from "@/components/EntityMultiSelect";

export function ListHeader({
  list,
  memberCount,
  isOwner,
  ownerLabel,
  selectedJobs,
  selectedAssignees,
  jobOptions,
  userOptions,
}: {
  list: {
    id: string;
    name: string;
    description: string | null;
    scope: ListScope;
  };
  memberCount: number;
  isOwner: boolean;
  ownerLabel: string;
  selectedJobs: EntityOption[];
  selectedAssignees: EntityOption[];
  jobOptions: EntityOption[];
  userOptions: EntityOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [scope, setScope] = useState<ListScope>(list.scope);
  const [jobs, setJobs] = useState<EntityOption[]>(selectedJobs);
  const [assignees, setAssignees] = useState<EntityOption[]>(selectedAssignees);

  function startEdit() {
    setName(list.name);
    setDescription(list.description ?? "");
    setScope(list.scope);
    setJobs(selectedJobs);
    setAssignees(selectedAssignees);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setError(null);
    setEditing(false);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    const fd = new FormData();
    fd.set("name", trimmed);
    fd.set("description", description);
    fd.set("scope", scope);
    jobs.forEach((j) => fd.append("jobIds", j.id));
    assignees.forEach((a) => fd.append("assigneeIds", a.id));
    startTransition(async () => {
      try {
        await updateList(list.id, fd);
        setEditing(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save changes.");
      }
    });
  }

  async function handleDelete() {
    if (!confirm(`Delete list "${list.name}"? Members aren't deleted — they just lose this list tag.`)) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteList(list.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete this list.");
      }
    });
  }

  if (editing) {
    return (
      <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="list-name">
              Name
            </label>
            <input
              id="list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="list-description">
              Description
            </label>
            <textarea
              id="list-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="What this list is for (optional)…"
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
            />
          </div>
          <fieldset>
            <legend className="mb-1 block text-sm font-medium">Visibility</legend>
            <div className="space-y-2 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="scope"
                  value={ListScope.PERSONAL}
                  checked={scope === ListScope.PERSONAL}
                  onChange={() => setScope(ListScope.PERSONAL)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Personal</span>{" "}
                  <span className="text-zinc-500">— only you can see and edit this list.</span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="scope"
                  value={ListScope.SHARED}
                  checked={scope === ListScope.SHARED}
                  onChange={() => setScope(ListScope.SHARED)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Shared</span>{" "}
                  <span className="text-zinc-500">
                    — everyone on the team can see and add to it. Only you can rename or delete it.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
          <div>
            <label className="mb-1 block text-sm font-medium">Jobs</label>
            <EntityMultiSelect
              name="jobIds"
              options={jobOptions}
              value={jobs}
              onChange={setJobs}
              placeholder="Link this list to job(s)…"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Assigned to</label>
            <EntityMultiSelect
              name="assigneeIds"
              options={userOptions}
              value={assignees}
              onChange={setAssignees}
              placeholder="Assign teammate(s)…"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{list.name}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${
            list.scope === ListScope.SHARED
              ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          }`}
        >
          {list.scope.toLowerCase()}
        </span>
        <span className="text-sm text-zinc-500">
          {memberCount} member{memberCount === 1 ? "" : "s"} · owned by {ownerLabel}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <EnrollListInSequenceButton listId={list.id} memberCount={memberCount} />
          {isOwner && (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-1.5 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                Delete list
              </button>
            </>
          )}
        </div>
      </div>

      {list.description && (
        <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
          {list.description}
        </p>
      )}

      {selectedJobs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-zinc-500">Jobs:</span>
          {selectedJobs.map((j) => (
            <Link
              key={j.id}
              href={`/jobs/${j.id}`}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 hover:underline dark:bg-zinc-800 dark:text-zinc-300"
            >
              {j.label}
            </Link>
          ))}
        </div>
      )}

      {selectedAssignees.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-zinc-500">Assigned to:</span>
          {selectedAssignees.map((a) => (
            <span
              key={a.id}
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {a.label}
            </span>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );
}
