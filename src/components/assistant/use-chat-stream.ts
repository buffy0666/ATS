"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatRequestBody, StreamEvent } from "./types";

type Handlers = {
  onEvent: (e: StreamEvent) => void;
  onError?: (err: unknown) => void;
  onDone?: () => void;
};

/**
 * Consumes the SSE stream from /api/assistant/chat. Each line is either:
 *   data: <json>
 *   (blank line separator)
 *
 * We parse each `data:` payload as a StreamEvent and dispatch via onEvent.
 *
 * Returns:
 *   send(body) — kicks off a new stream
 *   abort()    — closes the current reader (UI "Stop" button)
 *   pending    — true while a stream is open
 */
export function useChatStream({ onEvent, onError, onDone }: Handlers) {
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (body: ChatRequestBody) => {
      // Cancel any in-flight stream before starting a new one.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setPending(true);

      try {
        const response = await fetch("/api/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.status}`);
        }
        if (!response.body) {
          throw new Error("No response body from chat endpoint.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE messages are separated by a blank line. Each block may contain
          // multiple `data:` lines that should be joined with newlines.
          let blockEnd = buffer.indexOf("\n\n");
          while (blockEnd !== -1) {
            const block = buffer.slice(0, blockEnd);
            buffer = buffer.slice(blockEnd + 2);

            const payload = block
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");

            if (payload) {
              try {
                const event = JSON.parse(payload) as StreamEvent;
                onEvent(event);
              } catch {
                // Ignore malformed payloads; backend may emit comments/keepalives.
              }
            }

            blockEnd = buffer.indexOf("\n\n");
          }
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") {
          // Caller stopped the stream — not an error from the UI's POV.
        } else {
          onError?.(err);
        }
      } finally {
        controllerRef.current = null;
        setPending(false);
        onDone?.();
      }
    },
    [onEvent, onError, onDone],
  );

  const abort = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { send, abort, pending };
}
