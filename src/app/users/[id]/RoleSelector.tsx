"use client";

import { useState, useTransition } from "react";
import { Role } from "@/generated/prisma";
import { updateUserRole } from "../actions";

export function RoleSelector({
  userId,
  role,
  isSelf,
}: {
  userId: string;
  role: Role;
  isSelf: boolean;
}) {
  const [value, setValue] = useState<Role>(role);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  return (
    <div className="flex items-center gap-3">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as Role;
          setValue(next);
          startTransition(async () => {
            await updateUserRole(userId, next);
            setSavedAt(Date.now());
          });
        }}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm"
      >
        <option value={Role.RECRUITER}>Recruiter</option>
        <option value={Role.ADMIN} disabled={false}>
          Admin
        </option>
      </select>
      {pending && <span className="text-xs text-zinc-500">Saving…</span>}
      {!pending && savedAt && <span className="text-xs text-emerald-600">Saved</span>}
      {isSelf && value !== Role.ADMIN && (
        <span className="text-xs text-amber-600">Note: a self-demotion will be rejected.</span>
      )}
    </div>
  );
}
