/**
 * Shared types for the assistant chat UI. Mirror the backend's SSE contract
 * documented in the brief — keep field names in sync with
 * src/app/api/assistant/* once the backend lands.
 */

export type MessageRole = "user" | "assistant";

export type ToolCallState = "pending" | "ok" | "error" | "needs_approval";

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  state: ToolCallState;
  result?: unknown;
  errorMessage?: string;
};

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCall[];
  createdAt: string;
  pending?: boolean; // assistant message currently streaming
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

/** SSE event shape sent by /api/assistant/chat. */
export type StreamEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolCallId: string; result: unknown; ok: boolean; errorMessage?: string }
  | { type: "conversation"; conversationId: string }
  | { type: "done" }
  | { type: "error"; message: string };

export type ChatRequestBody = {
  conversationId?: string;
  message: string;
};
