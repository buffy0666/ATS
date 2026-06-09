import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { exchangeCode } from "@/lib/email/gmail";
import { saveGoogleConnection } from "@/lib/email/mailbox";

/**
 * Google OAuth callback. Verifies the CSRF state cookie, exchanges the code
 * for tokens, resolves the connected address, and stores the (encrypted)
 * refresh token against the current user. Redirects back to Settings → Email.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", base()));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`/settings/email?error=${encodeURIComponent(oauthError)}`, base()));
  }

  const jar = await cookies();
  const expectedState = jar.get("g_oauth_state")?.value;
  jar.delete("g_oauth_state");

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return NextResponse.redirect(new URL("/settings/email?error=state_mismatch", base()));
  }

  try {
    const { refreshToken, email, scope } = await exchangeCode(code);
    await saveGoogleConnection({
      userId: session.user.id,
      email,
      refreshToken,
      scope,
    });
    return NextResponse.redirect(new URL("/settings/email?connected=1", base()));
  } catch (err) {
    const message = err instanceof Error ? err.message : "connect_failed";
    return NextResponse.redirect(
      new URL(`/settings/email?error=${encodeURIComponent(message)}`, base()),
    );
  }
}

function base(): string {
  return process.env.AUTH_URL ?? "http://localhost:3000";
}
