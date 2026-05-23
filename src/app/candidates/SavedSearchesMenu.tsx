"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SavedSearchScope } from "@/generated/prisma";
import {
  createSavedSearch,
  deleteSavedSearch,
  updateSavedSearch,
} from "./saved-search-actions";

export type SavedSearchEntry = {
  id: string;
  name: string;
  paramsString: string;
  scope: SavedSearchScope;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string;
};

export function SavedSearchesMenu({
  entries,
  currentUserId,
}: {
  entries: SavedSearchEntry[];
  currentUserId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveScope, setSaveScope] = useState<SavedSearchScope>(SavedSearchScope.PERSONAL);
  const [pending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSave(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const currentParamsString = searchParams.toString();
  const canSave = currentParamsString.length > 0;

  function loadSearch(entry: SavedSearchEntry) {
    const target = entry.paramsString
      ? `/candidates?${entry.paramsString}`
      : "/candidates";
    router.push(target, { scroll: false });
    setOpen(false);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!saveName.trim()) return;
    startTransition(async () => {
      try {
        await createSavedSearch({
          name: saveName.trim(),
          paramsString: currentParamsString,
          scope: saveScope,
        });
        setSaveName("");
        setSaveScope(SavedSearchScope.PERSONAL);
        setShowSave(false);
        router.refresh();
      } catch (err) {
        console.warn("createSavedSearch failed", err);
        alert("Could not save this search.");
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete saved search "${name}"?`)) return;
    startTransition(async () => {
      try {
        await deleteSavedSearch(id);
        router.refresh();
      } catch (err) {
        console.warn("deleteSavedSearch failed", err);
        alert("Could not delete this saved search.");
      }
    });
  }

  function handleRename(entry: SavedSearchEntry) {
    const next = prompt("Rename saved search:", entry.name);
    if (!next || next.trim() === entry.name) return;
    startTransition(async () => {
      try {
        await updateSavedSearch(entry.id, { name: next.trim() });
        router.refresh();
      } catch (err) {
        console.warn("updateSavedSearch failed", err);
        alert("Could not rename this saved search.");
      }
    });
  }

  function toggleScope(entry: SavedSearchEntry) {
    const nextScope =
      entry.scope === SavedSearchScope.PERSONAL
        ? SavedSearchScope.SHARED
        : SavedSearchScope.PERSONAL;
    startTransition(async () => {
      try {
        await updateSavedSearch(entry.id, { scope: nextScope });
        router.refresh();
      } catch (err) {
        console.warn("updateSavedSearch failed", err);
        alert("Could not change scope for this saved search.");
      }
    });
  }

  const personal = entries.filter((e) => e.ownerId === currentUserId);
  const shared = entries.filter((e) => e.ownerId !== currentUserId);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
      >
        Saved ({entries.length})
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-30 text-sm">
          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
            {showSave ? (
              <form onSubmit={handleSave} className="space-y-2">
                <input
                  type="text"
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="Search name"
                  maxLength={120}
                  className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5 text-sm"
                />
                <div className="flex items-center gap-2 text-xs">
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name="scope"
                      checked={saveScope === SavedSearchScope.PERSONAL}
                      onChange={() => setSaveScope(SavedSearchScope.PERSONAL)}
                    />
                    Personal
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="radio"
                      name="scope"
                      checked={saveScope === SavedSearchScope.SHARED}
                      onChange={() => setSaveScope(SavedSearchScope.SHARED)}
                    />
                    Shared
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowSave(false)}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pending || !saveName.trim()}
                    className="rounded-md bg-zinc-900 dark:bg-zinc-100 px-2 py-1 text-white dark:text-zinc-900 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                disabled={!canSave}
                onClick={() => setShowSave(true)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
              >
                {canSave ? "Save current view…" : "No filters to save"}
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            <SearchGroup
              title="Personal"
              entries={personal}
              currentUserId={currentUserId}
              onLoad={loadSearch}
              onDelete={handleDelete}
              onRename={handleRename}
              onToggleScope={toggleScope}
            />
            <SearchGroup
              title="Shared"
              entries={shared}
              currentUserId={currentUserId}
              onLoad={loadSearch}
              onDelete={handleDelete}
              onRename={handleRename}
              onToggleScope={toggleScope}
            />
            {entries.length === 0 && (
              <div className="px-3 py-4 text-xs text-zinc-500">No saved searches yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SearchGroup({
  title,
  entries,
  currentUserId,
  onLoad,
  onDelete,
  onRename,
  onToggleScope,
}: {
  title: string;
  entries: SavedSearchEntry[];
  currentUserId: string;
  onLoad: (e: SavedSearchEntry) => void;
  onDelete: (id: string, name: string) => void;
  onRename: (e: SavedSearchEntry) => void;
  onToggleScope: (e: SavedSearchEntry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-zinc-400">
        {title}
      </div>
      {entries.map((entry) => {
        const isOwner = entry.ownerId === currentUserId;
        return (
          <div
            key={entry.id}
            className="group flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-950"
          >
            <button
              type="button"
              onClick={() => onLoad(entry)}
              className="min-w-0 flex-1 text-left text-sm truncate"
              title={entry.paramsString || "(no filters)"}
            >
              {entry.name}
              {!isOwner && (
                <span className="ml-1 text-[10px] text-zinc-400">
                  · {entry.ownerName ?? entry.ownerEmail}
                </span>
              )}
            </button>
            {isOwner && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 text-[10px]">
                <button
                  type="button"
                  onClick={() => onToggleScope(entry)}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
                  title={
                    entry.scope === SavedSearchScope.PERSONAL
                      ? "Make shared"
                      : "Make personal"
                  }
                >
                  {entry.scope === SavedSearchScope.PERSONAL ? "Share" : "Unshare"}
                </button>
                <button
                  type="button"
                  onClick={() => onRename(entry)}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 underline"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(entry.id, entry.name)}
                  className="text-red-600 dark:text-red-400 hover:underline"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
