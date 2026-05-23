"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EnrollmentStatus } from "@/generated/prisma";
import {
  cancelEnrollment,
  pauseEnrollment,
  resumeEnrollment,
} from "../../actions";

export function EnrollmentControls({
  enrollmentId,
  status,
}: {
  enrollmentId: string;
  status: EnrollmentStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) alert(r.message);
      router.refresh();
    });
  }

  if (status === EnrollmentStatus.COMPLETED || status === EnrollmentStatus.CANCELED) {
    return <span className="text-xs text-zinc-400">closed</span>;
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {status === EnrollmentStatus.ACTIVE && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => pauseEnrollment(enrollmentId))}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Pause
        </button>
      )}
      {status === EnrollmentStatus.PAUSED && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => resumeEnrollment(enrollmentId))}
          className="rounded-md border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
        >
          Resume
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm("Cancel this enrollment? Pending emails will be canceled with Resend.")) return;
          run(() => cancelEnrollment(enrollmentId));
        }}
        className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 px-2.5 py-1 text-xs hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
