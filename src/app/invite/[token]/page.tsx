import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { lookupInvitation } from "@/lib/invitations";
import { AcceptInvitationForm } from "./AcceptInvitationForm";

/**
 * Public magic-link accept page. Path: /invite/<plaintext-token>.
 *
 * Reachable without auth (whitelisted in auth.config.ts). If the visitor
 * is already signed in we still let them through — the action does the
 * right thing (it doesn't conflate the invitee with the current session).
 */
export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // If the user is already signed in, bounce them home — accepting an
  // invite means creating a new user, which contradicts an existing
  // session. They can sign out and try again if they really meant to.
  const session = await auth();
  if (session?.user) redirect("/");

  const result = await lookupInvitation(token);

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
        {result.status === "ok" ? (
          <>
            <h1 className="text-xl font-semibold mb-1">
              {result.invitation.asOwner
                ? `Welcome to ${result.invitation.organization.name}`
                : `Join ${result.invitation.organization.name}`}
            </h1>
            <p className="text-sm text-zinc-500 mb-6">
              {result.invitation.asOwner
                ? "You're being set up as the workspace owner. Pick a name and password to get started."
                : `${
                    result.invitation.invitedBy?.name ??
                    result.invitation.invitedBy?.email ??
                    "Your team"
                  } invited you. Pick a name and password to join.`}
            </p>
            <AcceptInvitationForm token={token} email={result.invitation.email} />
          </>
        ) : result.status === "expired" ? (
          <ExpiredCard organizationName={result.invitation.organization.name} />
        ) : result.status === "accepted" ? (
          <AlreadyUsedCard />
        ) : (
          <NotFoundCard />
        )}
      </div>
    </main>
  );
}

function ExpiredCard({ organizationName }: { organizationName: string }) {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">This invitation expired</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Invitations last 7 days. Ask whoever invited you to {organizationName} to
        send a fresh link.
      </p>
      <Link
        href="/login"
        className="text-sm text-zinc-900 dark:text-zinc-100 font-medium hover:underline"
      >
        Already have an account? Sign in →
      </Link>
    </div>
  );
}

function AlreadyUsedCard() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">This invitation was already used</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Looks like you (or someone with this link) already accepted it. Sign in
        with the email and password you set.
      </p>
      <Link
        href="/login"
        className="text-sm text-zinc-900 dark:text-zinc-100 font-medium hover:underline"
      >
        Go to sign in →
      </Link>
    </div>
  );
}

function NotFoundCard() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">Invitation not found</h1>
      <p className="text-sm text-zinc-500 mb-6">
        The link is malformed or has been revoked. Double-check the URL or ask
        for a new invitation.
      </p>
      <Link
        href="/login"
        className="text-sm text-zinc-900 dark:text-zinc-100 font-medium hover:underline"
      >
        Sign in →
      </Link>
    </div>
  );
}
