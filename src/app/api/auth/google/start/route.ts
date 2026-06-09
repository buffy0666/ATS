import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getAuthUrl, gmailConfigured } from "@/lib/email/gmail";

/**
 * Kick off the Gmail connect flow. Requires a signed-in user. Sets a signed
 * state cookie (CSRF) and redirects to Google's consent screen. The callback
 * verifies the same state.
 */
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.AUTH_URL ?? "http://localhost:3000"));
  }
  if (!gmailConfigured()) {
    return NextResponse.redirect(
      new URL("/settings/email?error=not_configured", base()),
    );
  }

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 min
    path: "/",
  });

  return NextResponse.redirect(getAuthUrl(state));
}

function base(): string {
  return process.env.AUTH_URL ?? "http://localhost:3000";
}
