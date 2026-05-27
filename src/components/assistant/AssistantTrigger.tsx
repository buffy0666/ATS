"use client";

import { useEffect, useState } from "react";
import { useAssistant } from "./AssistantProvider";

const PHRASES = ["Need Help?", "Have a Question?"];

export function AssistantTrigger() {
  const { open, toggle } = useAssistant();
  const [phrase, setPhrase] = useState(0);
  const [visible, setVisible] = useState(true);

  // Rotate the call-to-action text with a quick fade between phrases.
  useEffect(() => {
    if (open) return;
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setPhrase((p) => (p + 1) % PHRASES.length);
        setVisible(true);
      }, 300);
    }, 3200);
    return () => clearInterval(id);
  }, [open]);

  if (open) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
      <span
        className={`pointer-events-none select-none rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700 shadow-md transition-all duration-300 dark:border-indigo-800 dark:bg-zinc-900 dark:text-indigo-300 ${
          visible ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"
        }`}
      >
        {PHRASES[phrase]}
      </span>

      <button
        type="button"
        onClick={toggle}
        aria-label="Open assistant"
        title="Need help? Chat with the assistant"
        className="assistant-glow assistant-shimmer relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-amber-300 bg-gradient-to-br from-amber-100 to-amber-200 shadow-lg dark:border-amber-400/60"
      >
        <BearIcon className="bear-bob h-12 w-12" />
      </button>
    </div>
  );
}

function BearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* Waving paw — pivots near the wrist for a friendly wave. */}
      <g className="bear-arm-wave">
        <circle cx="51" cy="15" r="6.5" fill="#a86b43" />
        <circle cx="51" cy="15" r="2.6" fill="#7a4a28" />
      </g>

      {/* Ears */}
      <circle cx="20" cy="17" r="7" fill="#8b5e3c" />
      <circle cx="44" cy="17" r="7" fill="#8b5e3c" />
      <circle cx="20" cy="17" r="3.2" fill="#caa078" />
      <circle cx="44" cy="17" r="3.2" fill="#caa078" />

      {/* Head */}
      <circle cx="32" cy="35" r="18" fill="#a86b43" />

      {/* Snout */}
      <ellipse cx="32" cy="41" rx="9" ry="7" fill="#e7c8a8" />

      {/* Eyes */}
      <circle cx="25" cy="32" r="2.4" fill="#3a2415" />
      <circle cx="39" cy="32" r="2.4" fill="#3a2415" />
      <circle cx="25.8" cy="31.2" r="0.7" fill="#fff" />
      <circle cx="39.8" cy="31.2" r="0.7" fill="#fff" />

      {/* Nose + mouth */}
      <ellipse cx="32" cy="38" rx="3" ry="2.2" fill="#3a2415" />
      <path
        d="M32 40.2v2.4 M32 42.6q-2.6 1.8 -4.6 0 M32 42.6q2.6 1.8 4.6 0"
        stroke="#3a2415"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
