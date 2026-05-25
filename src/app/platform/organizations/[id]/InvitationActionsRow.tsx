"use client";

import { useActionState } from "react";
import {
  resendPlatformInvitationAction,
  revokePlatformInvitationAction,
  type ResendResult,
} from "./invitation-actions";

/**
 * Per-row interactive widget for a pending or expired invitation:
 *   - Resend → generates a fresh magic link, shows it inline.
 *   - Revoke → marks expired (only shown for still-pending rows).
 *
 * Why a client component: useActionState lets the resend response come
 * back into the same render without a navigation, so we can show the
 * new URL right there instead of stashing it in a query param (which
 * would log the secret token in the browser/server access logs).
 */
export function InvitationActionsRow({
  invitationId,
  isPending,
}: {
  invitationId: string;
  // Whether this invitation is in the "pending" bucket (not yet accepted,
  // not yet expired). Expired ones can still be resent but not revoked.
  isPending: boolean;
}) {
  const [state, resendAction, resending] = useActionState<
    ResendResult | undefined,
    FormData
  >(resendPlatformInvitationAction, undefined);

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <form action={resendAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <button
            type="submit"
            disabled={resending}
            className="text-xs rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {resending ? "Resending…" : "Resend"}
          </button>
        </form>
        {isPending && (
          <form action={revokePlatformInvitationAction}>
            <input type="hidden" name="invitationId" value={invitationId} />
            <button
              type="submit"
              className="text-xs rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Revoke
            </button>
          </form>
        )}
      </div>

      {state?.ok && (
        <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-2 text-xs space-y-1">
          <p
            className={
              state.emailSent
                ? "text-emerald-800 dark:text-emerald-300 font-medium"
                : "text-amber-800 dark:text-amber-200 font-medium"
            }
          >
            {state.emailSent
              ? `New invitation emailed to ${state.email}.`
              : `New invitation created. Email delivery failed — send the link below manually.`}
          </p>
          <p className="font-mono break-all select-all text-zinc-700 dark:text-zinc-300">
            {state.inviteUrl}
          </p>
          <p className="text-zinc-500">
            The previous link is no longer valid. This new link expires in 7
            days.
          </p>
        </div>
      )}
      {state && !state.ok && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}
    </div>
  );
}
