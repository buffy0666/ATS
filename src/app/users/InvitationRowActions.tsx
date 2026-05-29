"use client";

import { useState, useTransition } from "react";
import { resendInvitation, revokeInvitation } from "./actions";

/**
 * Resend + Revoke buttons for a pending invitation row.
 *
 *  - Resend: marks the existing invitation expired (audit trail), mints
 *    a fresh token + 14-day expiry, and re-emails the link.
 *  - Revoke: expires the invitation in place so the magic link no longer
 *    works. Row is preserved for audit but disappears from this list on
 *    next render (the page only loads non-expired invitations).
 */
export function InvitationRowActions({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function resend() {
    setStatus(null);
    startTransition(async () => {
      const res = await resendInvitation(invitationId);
      setStatus(res.ok ? "Resent" : res.error);
    });
  }

  function revoke() {
    if (!confirm(`Revoke the invitation to ${email}? Their existing link will stop working.`)) {
      return;
    }
    setStatus(null);
    startTransition(async () => {
      const res = await revokeInvitation(invitationId);
      if (!res.ok) setStatus(res.error);
      // On success the row disappears via revalidatePath, so no
      // status update needed.
    });
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      <button
        type="button"
        disabled={pending}
        onClick={resend}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-50"
      >
        {pending ? "…" : "Resend"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={revoke}
        className="rounded-md border border-red-300 dark:border-red-800 bg-white dark:bg-red-950/30 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50"
      >
        Revoke
      </button>
      {status && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{status}</span>
      )}
    </div>
  );
}
