"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "./types";
import { ToolCallCard } from "./ToolCallCard";

export function MessageItem({
  message,
  devMode = false,
}: {
  message: Message;
  devMode?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm">
      {message.content && (
        <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:text-xs prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      )}
      {message.toolCalls.map((tc) => (
        <ToolCallCard key={tc.id} call={tc} devMode={devMode} />
      ))}
      {message.pending && !message.content && message.toolCalls.length === 0 && (
        <div className="text-xs text-zinc-500 italic">Thinking…</div>
      )}
    </div>
  );
}
