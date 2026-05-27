import { NextRequest } from "next/server";
import { authenticateApiToken } from "@/lib/api-tokens";
import { prisma } from "@/lib/prisma";

/**
 * Lightweight identity probe for API tokens. The Outlook add-in calls this
 * after you save a token so it can show "Connected as: <Org> — <email>" —
 * making it obvious if you pasted a token from the wrong tenant (the exact
 * mix-up that silently routes captures to the wrong workspace).
 *
 * Auth: Bearer <ats_xxx>. Returns the token owner's email + their org.
 */

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && (origin.startsWith("chrome-extension://") || origin === process.env.APP_URL)
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  const authHeader = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(authHeader);
  if (!m) {
    return json({ error: "Missing Bearer token." }, 401, cors);
  }
  const auth = await authenticateApiToken(m[1]);
  if (!auth) {
    return json({ error: "Invalid or revoked token." }, 401, cors);
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      email: true,
      name: true,
      organization: { select: { name: true, slug: true } },
    },
  });
  if (!user) {
    return json({ error: "Token owner not found." }, 401, cors);
  }

  return json(
    {
      ok: true,
      email: user.email,
      name: user.name,
      organizationName: user.organization?.name ?? null,
      organizationSlug: user.organization?.slug ?? null,
    },
    200,
    cors,
  );
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
