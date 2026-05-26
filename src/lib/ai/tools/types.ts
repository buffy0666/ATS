import "server-only";

import { z } from "zod";
import type { Role } from "@/generated/prisma";

/**
 * Per-request context handed to every tool's execute() function. The
 * orchestrator builds it from the authenticated session and the conversation
 * row before dispatching the tool call.
 */
export type ToolContext = {
  userId: string;
  role: Role;
  conversationId: string;
  // Multi-tenant scope. Every tool that reads or writes tenant data must
  // include this in its where clauses — otherwise the assistant could
  // surface candidates / jobs / clients from another org. Nullable only
  // because the session might predate the org-aware sign-in (Phase 6
  // will lock this to non-null once everyone has re-authed).
  organizationId: string | null;
};

/**
 * One tool exposed to the AI assistant. The zod schema doubles as both the
 * runtime validator for the model's arguments and the JSON Schema published
 * to the model via the provider's tool-calling API.
 */
export type AssistantTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: string;
  description: string;
  /** When true, only ADMIN users see this tool in the available list. */
  requiresAdmin: boolean;
  parameters: TSchema;
  /**
   * Run the tool. Returned value is JSON-serialised back to the model as the
   * tool_result content; keep it concise and structured (the model has to
   * read it).
   */
  execute: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<unknown>;
};

/** Helper that preserves the zod schema type for execute()'s args. */
export function defineTool<TSchema extends z.ZodTypeAny>(
  tool: AssistantTool<TSchema>,
): AssistantTool<TSchema> {
  return tool;
}
