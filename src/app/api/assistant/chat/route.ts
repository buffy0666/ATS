import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { runAssistantTurn, type AssistantEvent } from "@/lib/ai/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Reasoning models (e.g. grok-4) routinely spend 30–90s "thinking" before
// emitting visible content. Without this Vercel kills the function at the
// plan's default (10s on Hobby, ~60s on Pro) and the chat stream just stops
// with no error in the UI. 300 is the Pro/Enterprise ceiling; Vercel clamps
// to whatever the plan actually allows.
export const maxDuration = 300;

const chatBodySchema = z.object({
  conversationId: z.string().min(1).max(40).optional(),
  message: z.string().min(1).max(8000),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof chatBodySchema>;
  try {
    body = chatBodySchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? z.prettifyError(error) : "Invalid body.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Find or create the conversation. Always scoped to the requesting user.
  let conversation = body.conversationId
    ? await prisma.assistantConversation.findFirst({
        where: { id: body.conversationId, userId: session.user.id },
        select: { id: true },
      })
    : null;
  if (!conversation) {
    conversation = await prisma.assistantConversation.create({
      data: { userId: session.user.id },
      select: { id: true },
    });
  }
  const conversationId = conversation.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // First event: tell the client which conversation we're on (matters
      // when it was created by this request).
      controller.enqueue(
        encoder.encode(formatSse({ type: "conversation", conversationId })),
      );
      try {
        const events = runAssistantTurn({
          conversationId,
          userId: session.user.id!,
          role: session.user.role,
          organizationId: session.user.organizationId ?? null,
          userMessage: body.message,
        });
        for await (const event of events) {
          controller.enqueue(encoder.encode(formatEvent(event)));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Assistant turn failed.";
        controller.enqueue(encoder.encode(formatSse({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function formatEvent(event: AssistantEvent): string {
  switch (event.type) {
    case "text":
      return formatSse({ type: "text", content: event.delta });
    case "tool_call":
      return formatSse({
        type: "tool_call",
        toolCall: {
          id: event.toolCall.id,
          name: event.toolCall.name,
          arguments: event.toolCall.arguments,
          state: "pending",
        },
      });
    case "tool_result": {
      const parsedResult = tryParseJson(event.content);
      const errorMessage = event.isError
        ? extractErrorMessage(parsedResult) ?? event.content
        : undefined;
      return formatSse({
        type: "tool_result",
        toolCallId: event.toolCallId,
        result: parsedResult ?? event.content,
        ok: !event.isError,
        ...(errorMessage ? { errorMessage } : {}),
      });
    }
    case "done":
      return formatSse({ type: "done" });
    case "error":
      return formatSse({ type: "error", message: event.message });
  }
}

// SSE envelope: the client reads only `data:` lines, so the discriminant
// `type` lives inside the JSON payload (the `event:` line would be lost).
function formatSse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractErrorMessage(value: unknown): string | undefined {
  if (value && typeof value === "object" && "error" in value) {
    const err = (value as { error: unknown }).error;
    if (typeof err === "string") return err;
  }
  return undefined;
}
