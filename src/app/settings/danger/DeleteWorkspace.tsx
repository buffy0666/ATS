"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteWorkspace } from "./actions";

type ImpactRow = { label: string; count: number };

/**
 * Synthesized evil laugh — six descending sawtooth "HA" bursts through a
 * lowpass filter, each with a downward pitch bend and a fast attack/decay
 * envelope. Pure Web Audio API, no asset to ship. Modest volume on purpose.
 */
function evilLaugh(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.2;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1100;
  filter.connect(master);
  master.connect(ctx.destination);

  const syllables = [
    { t: 0.0, f: 165, d: 0.3 },
    { t: 0.3, f: 150, d: 0.28 },
    { t: 0.58, f: 138, d: 0.26 },
    { t: 0.88, f: 124, d: 0.3 },
    { t: 1.22, f: 110, d: 0.42 },
    { t: 1.7, f: 96, d: 0.6 },
  ];
  for (const s of syllables) {
    const start = now + s.t;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(1, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + s.d);
    gain.connect(filter);

    // Two detuned voices an octave apart — sounds throatier than one.
    for (const [type, mult] of [["sawtooth", 1], ["square", 0.5]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(s.f * mult * 1.12, start);
      osc.frequency.exponentialRampToValueAtTime(s.f * mult * 0.82, start + s.d);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + s.d + 0.05);
    }
  }
}

/**
 * "Warning, Will Robinson! Warning, Will Robinson!" — spoken via the
 * Speech Synthesis API with the pitch dropped for maximum 1965-robot
 * effect. No-op on browsers without speechSynthesis.
 */
function warningWillRobinson() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(
    "Warning, Will Robinson! Warning, Will Robinson!",
  );
  utterance.rate = 0.95;
  utterance.pitch = 0.35;
  utterance.volume = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

/**
 * Hand-drawn skull & crossbones that appears to be laughing: the head rocks
 * side to side, the jaw chatters open/shut, the eye sockets glow, and little
 * "HA"s float up and fade. Pure CSS keyframes — no JS timers.
 */
function LaughingSkull({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <style>{`
        @keyframes skull-rock {
          0%, 100% { transform: rotate(-6deg); }
          50% { transform: rotate(6deg); }
        }
        @keyframes skull-jaw {
          0%, 100% { transform: translateY(0); }
          20% { transform: translateY(6px); }
          40% { transform: translateY(1px); }
          60% { transform: translateY(5px); }
          80% { transform: translateY(2px); }
        }
        @keyframes skull-eye-glow {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        @keyframes skull-ha {
          0% { opacity: 0; transform: translateY(6px) scale(0.8); }
          30% { opacity: 1; }
          100% { opacity: 0; transform: translateY(-14px) scale(1.15); }
        }
      `}</style>
      <svg viewBox="0 0 120 120" className="h-full w-full">
        {/* Crossbones */}
        <g stroke="#d6d3d1" strokeWidth="9" strokeLinecap="round">
          <line x1="18" y1="104" x2="102" y2="20" />
          <line x1="18" y1="20" x2="102" y2="104" />
        </g>
        <g fill="#d6d3d1">
          <circle cx="14" cy="100" r="6" /><circle cx="22" cy="108" r="6" />
          <circle cx="98" cy="16" r="6" /><circle cx="106" cy="24" r="6" />
          <circle cx="14" cy="24" r="6" /><circle cx="22" cy="16" r="6" />
          <circle cx="98" cy="108" r="6" /><circle cx="106" cy="100" r="6" />
        </g>

        {/* Rocking head (cranium + face + chattering jaw) */}
        <g style={{ animation: "skull-rock 1.3s ease-in-out infinite", transformOrigin: "60px 58px" }}>
          {/* Cranium */}
          <ellipse cx="60" cy="50" rx="31" ry="29" fill="#f5f3ec" />
          {/* Upper jaw / teeth */}
          <rect x="45" y="66" width="30" height="14" rx="4" fill="#f5f3ec" />
          <g stroke="#a8a29e" strokeWidth="1.5">
            <line x1="52.5" y1="68" x2="52.5" y2="80" />
            <line x1="60" y1="68" x2="60" y2="80" />
            <line x1="67.5" y1="68" x2="67.5" y2="80" />
          </g>
          {/* Eye sockets */}
          <ellipse cx="48" cy="50" rx="7.5" ry="9.5" fill="#18181b" />
          <ellipse cx="72" cy="50" rx="7.5" ry="9.5" fill="#18181b" />
          {/* Glowing pupils */}
          <circle cx="48" cy="51" r="3" fill="#ef4444" style={{ animation: "skull-eye-glow 1.3s ease-in-out infinite" }} />
          <circle cx="72" cy="51" r="3" fill="#ef4444" style={{ animation: "skull-eye-glow 1.3s ease-in-out infinite", animationDelay: "0.65s" }} />
          {/* Nasal cavity */}
          <path d="M60 56 l-4.5 8.5 h9 z" fill="#18181b" />
          {/* Chattering jaw */}
          <g style={{ animation: "skull-jaw 0.55s ease-in-out infinite" }}>
            <rect x="47" y="84" width="26" height="12" rx="5" fill="#f5f3ec" />
            <g stroke="#a8a29e" strokeWidth="1.5">
              <line x1="54" y1="85" x2="54" y2="95" />
              <line x1="60" y1="85" x2="60" y2="95" />
              <line x1="66" y1="85" x2="66" y2="95" />
            </g>
          </g>
        </g>

        {/* Floating laughter */}
        <g fill="#f87171" fontFamily="inherit" fontWeight="bold">
          <text x="94" y="40" fontSize="11" transform="rotate(12 94 40)" style={{ animation: "skull-ha 1.1s ease-out infinite" }}>HA</text>
          <text x="10" y="48" fontSize="9" transform="rotate(-10 10 48)" style={{ animation: "skull-ha 1.1s ease-out infinite", animationDelay: "0.4s" }}>HA</text>
          <text x="88" y="78" fontSize="8" transform="rotate(8 88 78)" style={{ animation: "skull-ha 1.1s ease-out infinite", animationDelay: "0.75s" }}>ha</text>
        </g>
      </svg>
    </div>
  );
}

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
  const [muted, setMuted] = useState(false);

  // Soundtrack plumbing. The AudioContext is created on the button click
  // (a user gesture), which is what satisfies browser autoplay policy.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const laughTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const matches = typed.trim() === orgName.trim();
  const total = impact.reduce((sum, r) => sum + r.count, 0);

  function playSoundtrack() {
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      // The robot warns first; the skull laughs at you right after.
      warningWillRobinson();
      laughTimerRef.current.push(setTimeout(() => evilLaugh(ctx), 2800));
      // Encore every ~8s while the modal stays open.
      const loop = setInterval(() => {
        warningWillRobinson();
        laughTimerRef.current.push(setTimeout(() => evilLaugh(ctx), 2800));
      }, 8000);
      laughTimerRef.current.push(loop as unknown as ReturnType<typeof setTimeout>);
    } catch {
      // No audio support — the skull laughs silently.
    }
  }

  function stopSoundtrack() {
    for (const t of laughTimerRef.current) {
      clearTimeout(t);
      clearInterval(t as unknown as ReturnType<typeof setInterval>);
    }
    laughTimerRef.current = [];
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function openSkull() {
    setMuted(false);
    setSkullOpen(true);
    playSoundtrack();
  }

  function closeSkull() {
    stopSoundtrack();
    setSkullOpen(false);
  }

  function muteSoundtrack() {
    stopSoundtrack();
    setMuted(true);
  }

  // Belt-and-suspenders: kill the noise if the component unmounts while
  // the modal is open (e.g. the delete succeeds and we navigate away).
  useEffect(() => stopSoundtrack, []);

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
                onClick={openSkull}
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
                  <div className="relative w-full max-w-md rounded-xl border-2 border-red-600 bg-zinc-950 p-8 text-center shadow-[0_0_60px_rgba(220,38,38,0.45)]">
                    <button
                      type="button"
                      onClick={muted ? openSkull : muteSoundtrack}
                      title={muted ? "Unmute" : "Silence it"}
                      aria-label={muted ? "Unmute the warning sounds" : "Mute the warning sounds"}
                      className="absolute right-3 top-3 rounded-md border border-zinc-700 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800"
                    >
                      {muted ? "🔇" : "🔊"}
                    </button>
                    <LaughingSkull className="mx-auto h-32 w-32" />
                    <h4 className="mt-4 text-lg font-bold uppercase tracking-widest text-red-500">
                      Warning 3 of 3 — point of no return
                    </h4>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-red-400/80">
                      Warning, Will Robinson! Warning, Will Robinson!
                    </p>
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
                        onClick={closeSkull}
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
