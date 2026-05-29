"use client";

import { useState, useTransition } from "react";
import { Role } from "@/generated/prisma";
import { updateUserRole } from "../actions";

export function RoleSelector({
  userId,
  role,
  isSelf,
  viewerRole,
}: {
  userId: string;
  role: Role;
  isSelf: boolean;
  /** Role of the currently-signed-in user. Drives which options they can pick. */
  viewerRole: Role;
}) {
  const [value, setValue] = useState<Role>(role);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only OWNER can assign OWNER; ADMIN can only assign RECRUITER or ADMIN.
  const viewerIsOwner = viewerRole === Role.OWNER;
  // The middle-tier ADMIN can't change an OWNER's role at all (would let
  // them demote the boss). Hide the control in that case.
  const viewingAnOwner = role === Role.OWNER;
  const disabledForViewer = !viewerIsOwner && viewingAnOwner;

  if (disabledForViewer) {
    return (
      <span className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        Owner (only another owner can change this)
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Role;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const res = await updateUserRole(userId, next);
            if (res && "ok" in res && !res.ok) {
              setError(res.error);
              setValue(role);
            } else {
              setSavedAt(Date.now());
            }
          });
        }}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      >
        <option value={Role.RECRUITER}>Recruiter</option>
        <option value={Role.ADMIN}>Admin</option>
        {/* Only OWNERs see the OWNER option — middle-tier ADMINs cannot
            promote themselves or anyone else to OWNER. */}
        {viewerIsOwner && <option value={Role.OWNER}>Owner</option>}
      </select>
      {pending && <span className="text-xs text-zinc-500">Saving…</span>}
      {!pending && savedAt && !error && <span className="text-xs text-emerald-600">Saved</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
      {isSelf && viewerIsOwner && value !== Role.OWNER && (
        <span className="text-xs text-amber-600">
          You&apos;re demoting yourself — at least one OWNER must remain.
        </span>
      )}
    </div>
  );
}
