"use client";

import { useTransition } from "react";
import { deleteInterview } from "../actions";

export function DeleteInterviewButton({
  interviewId,
  interviewTitle,
}: {
  interviewId: string;
  interviewTitle: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Delete interview "${interviewTitle}"? This also removes its attendees.`)) {
      return;
    }
    startTransition(() => deleteInterview(interviewId));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
    >
      {pending ? "Deleting..." : "Delete interview"}
    </button>
  );
}
