import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { runAssistantTurn, type AssistantEvent } from "@/lib/ai/orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
        encoder.encode(formatSse("conversation", { conversationId })),
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
        controller.enqueue(encoder.encode(formatSse("error", { message })));
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
      return formatSse("text", { delta: event.delta });
    case "tool_call":
      return formatSse("tool_call", event.toolCall);
    case "tool_result":
      return formatSse("tool_result", {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        content: event.content,
        isError: event.isError,
      });
    case "done":
      return formatSse("done", { messageId: event.messageId });
    case "error":
      return formatSse("error", { message: event.message });
  }
}

function formatSse(eventName: string, payload: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}
