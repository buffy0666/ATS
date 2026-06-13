"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAssistant } from "./AssistantProvider";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";
import type { ConversationSummary, Message, StreamEvent, ToolCall } from "./types";
import { useChatStream } from "./use-chat-stream";

/**
 * Pull a same-origin URL out of a tool's structured result, if present.
 * Tools like create_list / create_saved_search return `navigateTo` so the
 * chat can open the new artifact for the user without an extra click.
 */
function extractNavigateTo(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const v = (result as { navigateTo?: unknown }).navigateTo;
  if (typeof v !== "string") return null;
  // Only follow relative app paths — never an arbitrary http(s) URL from a
  // tool result. Prevents a hijacked tool from punting the user off-site.
  if (!v.startsWith("/") || v.startsWith("//")) return null;
  return v;
}

export function AssistantChat({ mode }: { mode: "panel" | "full" }) {
  const router = useRouter();
  const { activeConversationId, setActiveConversationId, setOpen } = useAssistant();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConvDropdown, setShowConvDropdown] = useState(false);
  // Small "via <model>" label in the header so the user can see which LLM
  // is answering. Loaded once on mount from /api/assistant/info.
  const [aiInfo, setAiInfo] = useState<{ providerLabel: string; model: string | null } | null>(
    null,
  );
  // "Dev mode" — only platform owners see raw tool args / JSON in tool cards.
  // Loaded alongside the model info from /api/assistant/info.
  const [devMode, setDevMode] = useState(false);
  const streamingMessageIdRef = useRef<string | null>(null);

  const { send, abort, pending } = useChatStream({
    onEvent: handleEvent,
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  function handleEvent(event: StreamEvent) {
    if (event.type === "conversation") {
      setActiveConversationId(event.conversationId);
      // Refresh the conversation list so the new one shows up in the header.
      void loadConversations();
      return;
    }
    if (event.type === "error") {
      setError(event.message);
      return;
    }

    const id = streamingMessageIdRef.current;
    if (!id) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (event.type === "text") {
          return { ...m, content: m.content + event.content };
        }
        if (event.type === "tool_call") {
          // Replace existing call with the same id, or append.
          const has = m.toolCalls.some((tc) => tc.id === event.toolCall.id);
          const toolCalls = has
            ? m.toolCalls.map((tc) => (tc.id === event.toolCall.id ? event.toolCall : tc))
            : [...m.toolCalls, event.toolCall];
          return { ...m, toolCalls };
        }
        if (event.type === "tool_result") {
          const toolCalls = m.toolCalls.map((tc): ToolCall => {
            if (tc.id !== event.toolCallId) return tc;
            return {
              ...tc,
              state: event.ok ? "ok" : "error",
              result: event.result,
              errorMessage: event.errorMessage,
            };
          });
          // If the tool succeeded with a same-origin navigateTo URL,
          // close the panel and route there so the new List / View opens
          // in front of the user. Defer to next tick so React can finish
          // applying the state update first.
          if (event.ok) {
            const url = extractNavigateTo(event.result);
            if (url) {
              setTimeout(() => {
                if (mode === "panel") setOpen(false);
                router.push(url);
              }, 0);
            }
          }
          return { ...m, toolCalls };
        }
        if (event.type === "done") {
          return { ...m, pending: false };
        }
        return m;
      }),
    );
  }

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch("/api/assistant/conversations");
      if (!r.ok) return;
      // API returns { conversations: [...] }, not a bare array. Tolerate
      // both shapes so a future server-side change can't crash the panel.
      const payload = (await r.json()) as
        | ConversationSummary[]
        | { conversations: ConversationSummary[] };
      const list = Array.isArray(payload) ? payload : payload?.conversations ?? [];
      setConversations(Array.isArray(list) ? list : []);
    } catch {
      // ignore — the dropdown just won't populate
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setHistoryLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/assistant/conversations/${conversationId}/messages`);
      if (!r.ok) {
        setMessages([]);
        return;
      }
      // The API actually responds with { conversation: { messages: [...] } }
      // where role is the AssistantRole enum (uppercase USER/ASSISTANT/
      // TOOL/SYSTEM). Tolerate either a bare array or the wrapped shape,
      // filter out TOOL/SYSTEM rows the UI doesn't render, and map the role
      // down to the lowercase form Message uses.
      const payload = (await r.json()) as unknown;
      const raw: unknown =
        Array.isArray(payload)
          ? payload
          : (payload as { conversation?: { messages?: unknown } })?.conversation?.messages ??
            (payload as { messages?: unknown })?.messages ??
            [];
      const list = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
      setMessages(
        list
          .filter((m) => {
            const role = String(m.role ?? "").toLowerCase();
            return role === "user" || role === "assistant";
          })
          .map((m): Message => {
            const role = String(m.role ?? "").toLowerCase() === "user" ? "user" : "assistant";
            const toolCalls = Array.isArray(m.toolCalls) ? (m.toolCalls as Message["toolCalls"]) : [];
            return {
              id: String(m.id ?? ""),
              role,
              content: String(m.content ?? ""),
              toolCalls,
              createdAt: String(m.createdAt ?? new Date().toISOString()),
              pending: false,
            };
          }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load messages.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/assistant/info");
        if (!r.ok) return;
        const data = (await r.json()) as {
          providerLabel?: unknown;
          model?: unknown;
          isPlatformAdmin?: unknown;
        };
        if (cancelled) return;
        const providerLabel = typeof data.providerLabel === "string" ? data.providerLabel : null;
        const model = typeof data.model === "string" && data.model.length > 0 ? data.model : null;
        if (providerLabel || model) {
          setAiInfo({ providerLabel: providerLabel ?? "AI", model });
        }
        setDevMode(data.isPlatformAdmin === true);
      } catch {
        // non-fatal — the label just won't render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      void loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, loadMessages]);

  function handleSend(text: string) {
    setError(null);
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      toolCalls: [],
      createdAt: new Date().toISOString(),
    };
    const assistantMsg: Message = {
      id: `asst-${Date.now()}`,
      role: "assistant",
      content: "",
      toolCalls: [],
      createdAt: new Date().toISOString(),
      pending: true,
    };
    streamingMessageIdRef.current = assistantMsg.id;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    void send({
      conversationId: activeConversationId ?? undefined,
      message: text,
    });
  }

  function startNewConversation() {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setShowConvDropdown(false);
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation? It can't be undone.")) return;
    try {
      await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
      if (id === activeConversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
      void loadConversations();
    } catch {
      // ignore
    }
  }

  const activeTitle = useMemo(() => {
    if (!activeConversationId) return "New conversation";
    // Defensive: if something ever puts a non-array into state, fall back
    // to a sane title rather than throwing during render.
    const list = Array.isArray(conversations) ? conversations : [];
    const c = list.find((x) => x.id === activeConversationId);
    return c?.title?.trim() || "Untitled conversation";
  }, [conversations, activeConversationId]);

  return (
    <div className={`flex h-full flex-col ${mode === "full" ? "" : ""}`}>
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setShowConvDropdown((s) => !s)}
            className="text-left text-sm font-medium truncate w-full hover:underline"
            title={activeTitle}
          >
            {activeTitle}
          </button>
          {aiInfo && (
            <div
              className="text-[10px] text-zinc-500 dark:text-zinc-500 truncate"
              title={`Powered by ${aiInfo.providerLabel}${aiInfo.model ? ` — ${aiInfo.model}` : ""}`}
            >
              via {aiInfo.model ?? aiInfo.providerLabel}
            </div>
          )}
          {showConvDropdown && (
            <div className="absolute left-0 top-full mt-1 w-72 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-20 text-sm max-h-80 overflow-y-auto">
              <button
                type="button"
                onClick={startNewConversation}
                className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 font-medium"
              >
                + New conversation
              </button>
              {conversations.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-500">No conversations yet.</div>
              ) : (
                conversations.slice(0, 10).map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-950 ${
                      c.id === activeConversationId ? "bg-zinc-50 dark:bg-zinc-950" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveConversationId(c.id);
                        setShowConvDropdown(false);
                      }}
                      className="flex-1 min-w-0 text-left truncate"
                      title={c.title ?? ""}
                    >
                      {c.title?.trim() || "Untitled"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConversation(c.id)}
                      className="ml-2 text-xs text-zinc-400 hover:text-red-600"
                      aria-label="Delete conversation"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {historyLoading ? (
        <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
          Loading conversation…
        </div>
      ) : (
        <MessageList messages={messages} devMode={devMode} />
      )}

      <Composer pending={pending} onSubmit={handleSend} onStop={abort} />
    </div>
  );
}
