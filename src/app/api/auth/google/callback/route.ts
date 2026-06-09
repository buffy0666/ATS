import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { exchangeCode } from "@/lib/email/gmail";
import { saveGoogleConnection } from "@/lib/email/mailbox";

/**
 * Google OAuth callback. Verifies the CSRF state cookie, exchanges the code
 * for tokens, resolves the connected address, and stores the (encrypted)
 * refresh token against the current user. Redirects back to the Profile page
 * where the "Sending email (Gmail)" UI lives.
 *
 * Redirect base is derived from the incoming request origin (req.nextUrl)
 * rather than an env var, so it always points at the host the user is actually
 * on (fixes redirects landing on localhost in production).
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const dest = (path: string) => NextResponse.redirect(new URL(path, origin));

  const session = await auth();
  if (!session?.user?.id) {
    return dest("/login");
  }

  const code = req.nextUrl.searchParams.get("code");
  const returnedState = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return dest(`/profile?email_error=${encodeURIComponent(oauthError)}`);
  }

  const jar = await cookies();
  const expectedState = jar.get("g_oauth_state")?.value;
  jar.delete("g_oauth_state");

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return dest("/profile?email_error=state_mismatch");
  }

  try {
    const { refreshToken, email, scope } = await exchangeCode(code);
    await saveGoogleConnection({
      userId: session.user.id,
      email,
      refreshToken,
      scope,
    });
    return dest("/profile?email_connected=1");
  } catch (err) {
    const message = err instanceof Error ? err.message : "connect_failed";
    return dest(`/profile?email_error=${encodeURIComponent(message)}`);
  }
}
