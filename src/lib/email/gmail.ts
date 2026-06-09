import "server-only";

/**
 * Gmail OAuth + send, implemented with plain fetch (no googleapis dependency
 * — keeps the bundle small; we only need three endpoints).
 *
 * Flow:
 *   1. getAuthUrl() → redirect the recruiter to Google's consent screen.
 *   2. Google redirects back with ?code → exchangeCode() swaps it for a
 *      refresh token (+ the connected address). We store the refresh token
 *      encrypted (lib/crypto).
 *   3. To send, getAccessToken(refreshToken) mints a short-lived access token,
 *      then sendGmail() posts the RFC822 message to the Gmail API.
 *
 * Env required:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  (from Google Cloud OAuth client)
 *   GOOGLE_OAUTH_REDIRECT_URI               (e.g. https://app/api/auth/google/callback)
 */

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_PROFILE = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

// gmail.send lets us send as the user; userinfo.email gives us their address;
// openid keeps the token endpoint returning an id_token we can read.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export function gmailConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

function requireConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Gmail is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** Build the Google consent URL. `state` is an opaque CSRF token we verify on return. */
export function getAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // required to receive a refresh token
    prompt: "consent", // force refresh-token issuance on re-connect
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
};

/** Exchange an auth code for tokens; resolve the connected email address. */
export async function exchangeCode(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  email: string;
  scope: string | null;
}> {
  const { clientId, clientSecret, redirectUri } = requireConfig();
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token exchange failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  if (!data.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Disconnect the app at myaccount.google.com/permissions and reconnect.",
    );
  }
  const email = await resolveEmail(data.access_token, data.id_token);
  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    email,
    scope: data.scope ?? null,
  };
}

/** Mint a short-lived access token from a stored refresh token. */
export async function getAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = requireConfig();
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Google token refresh failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data.access_token;
}

async function resolveEmail(accessToken: string, idToken?: string): Promise<string> {
  // Prefer the Gmail profile (authoritative for the sending address).
  try {
    const res = await fetch(GMAIL_PROFILE, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const data = (await res.json()) as { emailAddress?: string };
      if (data.emailAddress) return data.emailAddress;
    }
  } catch {
    // fall through to id_token
  }
  // Fallback: decode the id_token payload (no verification needed — it just
  // came from Google over TLS in this same exchange).
  if (idToken) {
    const parts = idToken.split(".");
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (typeof payload.email === "string") return payload.email;
      } catch {
        // ignore
      }
    }
  }
  throw new Error("Could not determine the connected Gmail address.");
}

export type GmailMessage = {
  from: string; // "Name <addr>" or addr
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text?: string;
  html?: string;
};

/** Send a message via the Gmail API. Returns the Gmail message id. */
export async function sendGmail(
  accessToken: string,
  msg: GmailMessage,
): Promise<{ id: string; threadId: string }> {
  const raw = buildRfc822(msg);
  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await fetch(GMAIL_SEND, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw: encoded }),
  });
  const data = (await res.json()) as { id?: string; threadId?: string; error?: { message?: string } };
  if (!res.ok || !data.id) {
    throw new Error(`Gmail send failed: ${data.error?.message ?? res.status}`);
  }
  return { id: data.id, threadId: data.threadId ?? data.id };
}

/** Build a minimal RFC 822 message. Uses multipart/alternative when both
 *  text and html are present; otherwise a single body part. */
function buildRfc822(msg: GmailMessage): string {
  const to = Array.isArray(msg.to) ? msg.to.join(", ") : msg.to;
  const headers: string[] = [
    `From: ${msg.from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    "MIME-Version: 1.0",
  ];
  if (msg.cc?.length) headers.push(`Cc: ${msg.cc.join(", ")}`);
  if (msg.bcc?.length) headers.push(`Bcc: ${msg.bcc.join(", ")}`);
  if (msg.replyTo) headers.push(`Reply-To: ${msg.replyTo}`);

  if (msg.text && msg.html) {
    const boundary = `b_${Date.now().toString(36)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      msg.text,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      msg.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

  const isHtml = Boolean(msg.html);
  headers.push(`Content-Type: text/${isHtml ? "html" : "plain"}; charset=UTF-8`);
  return [headers.join("\r\n"), "", (isHtml ? msg.html : msg.text) ?? ""].join("\r\n");
}

// RFC 2047 encode non-ASCII subjects so accents/emoji survive.
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}
