"use client";

import { useEffect, useRef } from "react";
import type { Message } from "./types";
import { MessageItem } from "./MessageItem";

export function MessageList({
  messages,
  devMode = false,
}: {
  messages: Message[];
  devMode?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="text-sm text-zinc-500 max-w-sm">
          <p className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">Ask me anything about your pipeline.</p>
          <p className="text-xs">
            “Find me 3 senior engineers,” “Make a list called Hot Leads with those,” “Email Sarah a follow-up.”
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((m) => (
        <MessageItem key={m.id} message={m} devMode={devMode} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
