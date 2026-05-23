"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activeSequencesForBulk } from "@/app/candidates/bulk-actions";
import { enrollListInSequence } from "@/app/sequences/actions";

export function EnrollListInSequenceButton({
  listId,
  memberCount,
}: {
  listId: string;
  memberCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sequences, setSequences] = useState<{ id: string; name: string }[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!open || sequences !== null) return;
    activeSequencesForBulk().then((s) => {
      setSequences(s);
      if (s.length > 0) setSelectedId(s[0].id);
    });
  }, [open, sequences]);

  function submit() {
    if (!selectedId) return;
    if (
      !confirm(
        `Enroll all ${memberCount} list member${memberCount === 1 ? "" : "s"} into this sequence?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await enrollListInSequence(listId, selectedId);
      setBanner({ tone: r.ok ? "ok" : "err", text: r.message });
      if (r.ok) {
        setOpen(false);
        router.refresh();
      }
      setTimeout(() => setBanner(null), 5000);
    });
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        disabled={memberCount === 0}
        className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        Enroll list in sequence
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 shadow-lg text-sm"
        >
          <label className="block">
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1">
              Sequence
            </span>
            {sequences === null ? (
              <p className="text-xs text-zinc-500">Loading…</p>
            ) : sequences.length === 0 ? (
              <p className="text-xs text-zinc-500">No active sequences.</p>
            ) : (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-2 py-1.5"
              >
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </label>
          {banner && (
            <p
              className={`mt-2 text-xs ${
                banner.tone === "ok"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
              aria-live="polite"
            >
              {banner.text}
            </p>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || !selectedId}
              className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2.5 py-1 text-xs font-medium disabled:opacity-50"
            >
              {pending ? "Enrolling…" : "Enroll all"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
