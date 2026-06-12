"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteWorkspace } from "./actions";

type ImpactRow = { label: string; count: number };

/**
 * Three-layer workspace deletion:
 *
 *   Layer 1 — arm: reveal the impact table and acknowledge the consequences
 *             via checkbox.
 *   Layer 2 — type-to-confirm: type the workspace's exact name.
 *   Layer 3 — the skull: a full-screen ☠️ modal with a 5-second countdown
 *             before the real destroy button goes live.
 *
 * All of it is UX guard only — the server action independently re-verifies
 * the typed name and the OWNER role; that's the security boundary.
 */
export function DeleteWorkspace({
  orgName,
  impact,
}: {
  orgName: string;
  impact: ImpactRow[];
}) {
  const [state, formAction, pending] = useActionState(deleteWorkspace, undefined);

  // Layer 1
  const [armed, setArmed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  // Layer 2
  const [typed, setTyped] = useState("");
  // Layer 3
  const [skullOpen, setSkullOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const matches = typed.trim() === orgName.trim();
  const total = impact.reduce((sum, r) => sum + r.count, 0);

  // The final button unlocks only after the countdown finishes.
  useEffect(() => {
    if (!skullOpen) {
      setCountdown(5);
      return;
    }
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [skullOpen, countdown]);

  return (
    <section className="mt-6 rounded-lg border border-red-300 bg-red-50/50 p-5 dark:border-red-900/60 dark:bg-red-950/20">
      <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
        Delete this workspace
      </h3>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
        Permanently deletes <span className="font-semibold">{orgName}</span> and{" "}
        <span className="font-semibold">everything in it</span>. This cannot be undone, and there is
        no backup or grace period.
      </p>

      {/* ---- Layer 1: arm ---------------------------------------------- */}
      {!armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="mt-4 rounded-md border border-red-400 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
        >
          I want to delete this workspace…
        </button>
      ) : (
        <>
          <div className="mt-4 rounded-md border border-red-200 bg-white p-3 dark:border-red-900/50 dark:bg-zinc-900">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Warning 1 of 3 — what will be destroyed
            </p>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {impact.map((r) => (
                <li key={r.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-zinc-600 dark:text-zinc-400">{r.label}</span>
                  <span className="font-semibold tabular-nums">{r.count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-red-700 dark:text-red-400">
              Every team member (including you) will be signed out and their account removed. You
              will be returned to the login screen.
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="rounded border-red-400"
              />
              I understand this destroys {total > 0 ? `${total.toLocaleString()} records` : "all data"}{" "}
              and every user account, permanently.
            </label>
          </div>

          {/* ---- Layer 2: type-to-confirm ------------------------------- */}
          {acknowledged && (
            <form action={formAction} className="mt-4">
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-700 dark:text-zinc-300">
                  Warning 2 of 3 — type{" "}
                  <span className="font-mono font-semibold">{orgName}</span> to confirm
                </span>
                <input
                  name="confirmName"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={orgName}
                  className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </label>

              {state && !state.ok && state.error && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>
              )}

              <button
                type="button"
                onClick={() => setSkullOpen(true)}
                disabled={!matches || pending}
                className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue to final warning…
              </button>

              {/* ---- Layer 3: the skull ---------------------------------- */}
              {skullOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                  role="alertdialog"
                  aria-modal="true"
                  aria-label="Final deletion warning"
                >
                  <div className="w-full max-w-md rounded-xl border-2 border-red-600 bg-zinc-950 p-8 text-center shadow-[0_0_60px_rgba(220,38,38,0.45)]">
                    <div className="animate-pulse text-7xl leading-none" aria-hidden="true">
                      ☠️
                    </div>
                    <h4 className="mt-4 text-lg font-bold uppercase tracking-widest text-red-500">
                      Warning 3 of 3 — point of no return
                    </h4>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                      You are about to erase{" "}
                      <span className="font-semibold text-white">{orgName}</span>
                      {total > 0 && (
                        <>
                          {" "}— <span className="font-semibold text-white">
                            {total.toLocaleString()} records
                          </span>
                        </>
                      )}{" "}
                      and every user account in it. Forever. No backup. No undo. No grace period.
                    </p>

                    <div className="mt-6 flex flex-col gap-2">
                      <button
                        type="submit"
                        disabled={countdown > 0 || pending}
                        className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {pending
                          ? "Deleting…"
                          : countdown > 0
                            ? `Yes, destroy it forever (${countdown})`
                            : "Yes, destroy it forever"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkullOpen(false)}
                        disabled={pending}
                        className="rounded-md border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
                      >
                        Take me back to safety
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}
