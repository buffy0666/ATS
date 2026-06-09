"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectMyMailbox } from "./mailbox-actions";

/**
 * Connect / disconnect the recruiter's Gmail sending mailbox. Connecting is a
 * full-page redirect to Google's consent screen (/api/auth/google/start);
 * disconnecting is a server action. Sending requires a connected mailbox, so
 * this is where recruiters enable it.
 */
export function MailboxSection({
  status,
  justConnected = false,
  errorCode = null,
}: {
  status:
    | { connected: true; provider: string; email: string }
    | { connected: false; configured: boolean };
  justConnected?: boolean;
  errorCode?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const banner =
    errorCode != null ? (
      <p className="mb-3 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-800 dark:text-red-200">
        Couldn&apos;t connect Gmail: {friendlyError(errorCode)}
      </p>
    ) : justConnected ? (
      <p className="mb-3 rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
        Gmail connected — you can now send from your own address.
      </p>
    ) : null;

  function disconnect() {
    if (!confirm("Disconnect Gmail? You won't be able to send until you reconnect.")) return;
    startTransition(async () => {
      await disconnectMyMailbox();
      router.refresh();
    });
  }

  if (status.connected) {
    return (
      <div>
      {banner}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Connected as <strong className="font-medium">{status.email}</strong>
          </span>
          <p className="mt-1 text-xs text-zinc-500">
            Emails you send from the ATS go out from this address via Gmail, and
            replies land in your inbox.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/auth/google/start"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Reconnect
          </a>
          <button
            type="button"
            onClick={disconnect}
            disabled={pending}
            className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-3 py-1.5 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
          >
            {pending ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      </div>
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div>
        {banner}
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Gmail sending isn&apos;t configured for this workspace yet. An admin needs to
          set up the Google OAuth credentials.
        </p>
      </div>
    );
  }

  return (
    <div>
      {banner}
      <a
        href="/api/auth/google/start"
        className="inline-flex items-center gap-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Connect Gmail
      </a>
      <p className="mt-2 text-xs text-zinc-500">
        You&apos;ll be asked to grant permission to send email on your behalf. We only
        request the send scope — we can&apos;t read your inbox.
      </p>
    </div>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "state_mismatch":
      return "the security check failed (try connecting again from this page).";
    case "not_configured":
      return "Gmail OAuth isn't configured for this workspace yet.";
    case "access_denied":
      return "you declined the permission request.";
    default:
      return code.replace(/_/g, " ");
  }
}
