"use client";

import { useAssistant } from "./AssistantProvider";

export function AssistantTrigger() {
  const { open, toggle, activeConversationId } = useAssistant();
  if (open) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Open assistant"
      title="Assistant"
      className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-lg flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
    >
      <ChatIcon className="h-6 w-6" />
      {activeConversationId && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full ring-2 ring-zinc-300/60 dark:ring-zinc-600/60 animate-pulse pointer-events-none"
        />
      )}
    </button>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" />
      <circle cx="9" cy="12" r="0.8" fill="currentColor" />
      <circle cx="12" cy="12" r="0.8" fill="currentColor" />
      <circle cx="15" cy="12" r="0.8" fill="currentColor" />
    </svg>
  );
}
