import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  AssistantRole,
  Prisma,
  Role,
} from "@/generated/prisma";
import { chat, type ChatChunk, type ChatMessage, type ToolCall, type ToolDefinition } from ".";
import { findToolByName, getAvailableTools, type AssistantTool } from "./tools";

// Cap on tool calls per user turn to prevent runaway loops if the model
// keeps calling itself instead of writing a final answer.
const MAX_TOOL_CALLS = 6;
// Cap on streaming bytes per text turn — a safety belt against models that
// stream uncapped output.
const MAX_TEXT_BYTES = 64 * 1024;

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolCallId: string; toolName: string; content: string; isError: boolean }
  | { type: "done"; messageId: string | null }
  | { type: "error"; message: string };

export type RunAssistantInput = {
  conversationId: string;
  userId: string;
  role: Role;
  // Multi-tenant: piped from session.user.organizationId at the route layer.
  // Nullable to absorb users on stale (pre-Phase-2) sessions; the tools
  // refuse to operate when null.
  organizationId: string | null;
  userMessage: string;
};

export async function* runAssistantTurn(
  input: RunAssistantInput,
): AsyncIterable<AssistantEvent> {
  const { conversationId, userId, role, userMessage, organizationId } = input;

  try {
    // 1. Persist the user's message + ensure the conversation has a title.
    await prisma.assistantMessage.create({
      data: {
        conversationId,
        role: AssistantRole.USER,
        content: userMessage,
      },
    });
    await ensureConversationTitle(conversationId, userMessage);

    // 2. Build the message list from DB history + system prompt.
    const [conversation, user] = await Promise.all([
      prisma.assistantConversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              toolCalls: true,
              toolCallId: true,
            },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);
    if (!conversation || !user) {
      yield { type: "error", message: "Conversation or user not found." };
      yield { type: "done", messageId: null };
      return;
    }

    const tools = getAvailableTools(role);
    const toolDefinitions: ToolDefinition[] = tools.map(toToolDefinition);

    const systemPrompt = buildSystemPrompt({
      userName: user.name ?? user.email,
      userEmail: user.email,
      userRole: user.role,
      tools,
    });

    let messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...conversation.messages.map(toChatMessage).filter(notSystem),
    ];

    let toolCallsUsed = 0;
    let lastAssistantMessageId: string | null = null;

    // 3. Multi-turn tool loop.
    while (true) {
      const turnText: string[] = [];
      let turnTextBytes = 0;
      const turnToolCalls: ToolCall[] = [];
      let finishReason: ChatChunk["type"] extends infer T ? T : never = "done" as never;
      let finishReasonValue: "stop" | "tool_calls" | "length" | "error" = "stop";

      for await (const chunk of chat(
        { messages, tools: toolDefinitions, maxTokens: 4096 },
        organizationId,
      )) {
        switch (chunk.type) {
          case "text": {
            const remaining = MAX_TEXT_BYTES - turnTextBytes;
            if (remaining <= 0) break;
            const piece =
              chunk.delta.length > remaining ? chunk.delta.slice(0, remaining) : chunk.delta;
            turnText.push(piece);
            turnTextBytes += piece.length;
            yield { type: "text", delta: piece };
            break;
          }
          case "tool_call":
            turnToolCalls.push(chunk.toolCall);
            yield { type: "tool_call", toolCall: chunk.toolCall };
            break;
          case "done":
            finishReasonValue = chunk.finishReason;
            break;
        }
      }

      const assistantContent = turnText.join("");

      // Persist the assistant turn — even when it's just a tool call with no
      // visible text, we still want an audit row.
      const assistantMsg = await prisma.assistantMessage.create({
        data: {
          conversationId,
          role: AssistantRole.ASSISTANT,
          content: assistantContent,
          toolCalls:
            turnToolCalls.length > 0
              ? (turnToolCalls as unknown as Prisma.InputJsonValue)
              : undefined,
        },
        select: { id: true },
      });
      lastAssistantMessageId = assistantMsg.id;

      messages = [
        ...messages,
        {
          role: "assistant",
          content: assistantContent,
          toolCalls: turnToolCalls.length > 0 ? turnToolCalls : undefined,
        },
      ];

      if (turnToolCalls.length === 0 || finishReasonValue !== "tool_calls") {
        yield { type: "done", messageId: assistantMsg.id };
        return;
      }

      // 4. Dispatch every tool call this assistant turn produced.
      for (const tc of turnToolCalls) {
        if (toolCallsUsed >= MAX_TOOL_CALLS) {
          const note = `Tool-call limit (${MAX_TOOL_CALLS}) reached for this message. Stopping.`;
          await prisma.assistantMessage.create({
            data: {
              conversationId,
              role: AssistantRole.TOOL,
              content: JSON.stringify({ error: note }),
              toolCallId: tc.id,
            },
          });
          await prisma.assistantToolCall.create({
            data: {
              messageId: assistantMsg.id,
              userId,
              toolName: tc.name,
              arguments: tc.arguments as Prisma.InputJsonValue,
              isError: true,
              errorMessage: note,
            },
          });
          yield {
            type: "tool_result",
            toolCallId: tc.id,
            toolName: tc.name,
            content: note,
            isError: true,
          };
          continue;
        }
        toolCallsUsed++;

        const result = await runOneTool({
          toolCall: tc,
          assistantMessageId: assistantMsg.id,
          userId,
          role,
          conversationId,
          organizationId,
        });

        messages = [
          ...messages,
          { role: "tool", content: result.content, toolCallId: tc.id },
        ];

        yield {
          type: "tool_result",
          toolCallId: tc.id,
          toolName: tc.name,
          content: result.content,
          isError: result.isError,
        };
      }

      if (toolCallsUsed >= MAX_TOOL_CALLS) {
        // We logged the per-call rejection above; final assistant message
        // will be the model's response to the truncated tool results.
      }
      // loop back to ask the model what to do with the tool results
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown assistant error.";
    yield { type: "error", message };
    yield { type: "done", messageId: null };
  }
}

// ---------- tool dispatch ----------

type ToolRunResult = { content: string; isError: boolean };

async function runOneTool(input: {
  toolCall: ToolCall;
  assistantMessageId: string;
  userId: string;
  role: Role;
  conversationId: string;
  organizationId: string | null;
}): Promise<ToolRunResult> {
  const { toolCall, assistantMessageId, userId, role, conversationId, organizationId } = input;
  const tool = findToolByName(toolCall.name);

  if (!tool) {
    const errMsg = `Unknown tool "${toolCall.name}".`;
    await persistToolOutcome({
      conversationId,
      assistantMessageId,
      userId,
      tool: null,
      toolName: toolCall.name,
      toolCallId: toolCall.id,
      arguments: toolCall.arguments,
      result: null,
      isError: true,
      errorMessage: errMsg,
    });
    return { content: JSON.stringify({ error: errMsg }), isError: true };
  }

  if (tool.requiresAdmin && role !== Role.ADMIN) {
    const errMsg = `Tool "${tool.name}" requires admin role.`;
    await persistToolOutcome({
      conversationId,
      assistantMessageId,
      userId,
      tool,
      toolName: tool.name,
      toolCallId: toolCall.id,
      arguments: toolCall.arguments,
      result: null,
      isError: true,
      errorMessage: errMsg,
    });
    return { content: JSON.stringify({ error: errMsg }), isError: true };
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = tool.parameters.parse(toolCall.arguments);
  } catch (error) {
    const errMsg =
      error instanceof z.ZodError
        ? `Invalid arguments: ${z.prettifyError(error)}`
        : error instanceof Error
          ? error.message
          : "Invalid arguments";
    await persistToolOutcome({
      conversationId,
      assistantMessageId,
      userId,
      tool,
      toolName: tool.name,
      toolCallId: toolCall.id,
      arguments: toolCall.arguments,
      result: null,
      isError: true,
      errorMessage: errMsg,
    });
    return { content: JSON.stringify({ error: errMsg }), isError: true };
  }

  try {
    const result = await tool.execute(parsedArgs, {
      userId,
      role,
      conversationId,
      organizationId,
    });
    await persistToolOutcome({
      conversationId,
      assistantMessageId,
      userId,
      tool,
      toolName: tool.name,
      toolCallId: toolCall.id,
      arguments: toolCall.arguments,
      result,
      isError: false,
      errorMessage: null,
    });
    return { content: serialiseResult(result), isError: false };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Tool execution failed.";
    await persistToolOutcome({
      conversationId,
      assistantMessageId,
      userId,
      tool,
      toolName: tool.name,
      toolCallId: toolCall.id,
      arguments: toolCall.arguments,
      result: null,
      isError: true,
      errorMessage: errMsg,
    });
    return { content: JSON.stringify({ error: errMsg }), isError: true };
  }
}

async function persistToolOutcome(input: {
  conversationId: string;
  assistantMessageId: string;
  userId: string;
  tool: AssistantTool | null;
  toolName: string;
  toolCallId: string;
  arguments: Record<string, unknown>;
  result: unknown;
  isError: boolean;
  errorMessage: string | null;
}): Promise<void> {
  await prisma.assistantMessage.create({
    data: {
      conversationId: input.conversationId,
      role: AssistantRole.TOOL,
      content: input.isError
        ? JSON.stringify({ error: input.errorMessage })
        : serialiseResult(input.result),
      toolCallId: input.toolCallId,
    },
  });
  await prisma.assistantToolCall.create({
    data: {
      messageId: input.assistantMessageId,
      userId: input.userId,
      toolName: input.toolName,
      arguments: input.arguments as Prisma.InputJsonValue,
      result:
        input.result === null || input.result === undefined
          ? Prisma.JsonNull
          : (input.result as Prisma.InputJsonValue),
      isError: input.isError,
      errorMessage: input.errorMessage,
    },
  });
}

function serialiseResult(value: unknown): string {
  if (value === undefined || value === null) return "null";
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Result was not JSON-serialisable." });
  }
}

// ---------- helpers ----------

function toToolDefinition(tool: AssistantTool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.parameters),
  };
}

function toChatMessage(m: {
  role: AssistantRole;
  content: string;
  toolCalls: unknown;
  toolCallId: string | null;
}): ChatMessage {
  switch (m.role) {
    case AssistantRole.SYSTEM:
      return { role: "system", content: m.content };
    case AssistantRole.USER:
      return { role: "user", content: m.content };
    case AssistantRole.ASSISTANT: {
      const toolCalls = Array.isArray(m.toolCalls)
        ? (m.toolCalls as ToolCall[])
        : undefined;
      return { role: "assistant", content: m.content, toolCalls };
    }
    case AssistantRole.TOOL:
      return { role: "tool", content: m.content, toolCallId: m.toolCallId ?? "" };
  }
}

function notSystem(m: ChatMessage): boolean {
  return m.role !== "system";
}

function buildSystemPrompt(input: {
  userName: string;
  userEmail: string;
  userRole: Role;
  tools: AssistantTool[];
}): string {
  const toolList = input.tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return [
    "You are the AI assistant inside a recruiting firm's ATS.",
    `Current user: ${input.userName} (${input.userEmail}), role: ${input.userRole}.`,
    "",
    "Use the tools below to act on the user's behalf. Prefer running a tool over guessing.",
    "For destructive or outbound actions — sending emails, deactivating users, mass enrollments — describe what you're about to do in natural language and confirm with the user first; only call the tool after they say yes.",
    "Cite candidate / job / list ids when relevant so the user can verify in the UI.",
    "All timestamps in tool results are UTC; render them human-readably (e.g. 'tomorrow at 2:30 PM').",
    "Be concise. Plain prose. Don't repeat the user's question back at them.",
    "",
    "Available tools:",
    toolList,
  ].join("\n");
}

async function ensureConversationTitle(conversationId: string, firstMessage: string) {
  const convo = await prisma.assistantConversation.findUnique({
    where: { id: conversationId },
    select: { title: true },
  });
  if (!convo || convo.title) return;
  const trimmed = firstMessage.trim().replace(/\s+/g, " ");
  const title = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
  await prisma.assistantConversation.update({
    where: { id: conversationId },
    data: { title },
  });
}
