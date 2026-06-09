import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getAuthUrl, gmailConfigured } from "@/lib/email/gmail";

/**
 * Kick off the Gmail connect flow. Requires a signed-in user. Sets a state
 * cookie (CSRF) and redirects to Google's consent screen. The callback
 * verifies the same state.
 *
 * Redirect base comes from the request origin (not an env var) so it matches
 * the host the user is on — same host the state cookie is set on, which keeps
 * the callback's cookie check working.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  if (!gmailConfigured()) {
    return NextResponse.redirect(new URL("/profile?email_error=not_configured", origin));
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
