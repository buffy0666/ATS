import { requireSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { TokensTable } from "@/app/settings/api-tokens/TokensTable";
import { MailboxSection } from "./MailboxSection";
import { getMailboxStatus } from "@/lib/email/mailbox";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ email_connected?: string; email_error?: string }>;
}) {
  const session = await requireSession();
  const { name, email, role } = session.user;
  const sp = await searchParams;

  // Self-serve API tokens — any user (recruiter included) can mint their
  // own here for the Outlook add-in / Chrome extension. Tokens are scoped
  // to this user + their org, so captures are attributed to them and land
  // in the right workspace. (The same table lives in admin Settings, but
  // Settings is hidden from non-admins, so we surface it on the profile
  // page which everyone can reach.)
  const tokens = await prisma.apiToken.findMany({
    where: { userId: session.user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });

  const mailboxStatus = await getMailboxStatus(session.user.id ?? "");

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-semibold">My profile</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Your account details and password.
      </p>

      <section className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Account
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Name</dt>
            <dd className="mt-0.5">{name || <span className="text-zinc-400">—</span>}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Email</dt>
            <dd className="mt-0.5 break-all">{email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">Role</dt>
            <dd className="mt-0.5">
              <span className="rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {role}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-1">
          Change password
        </h2>
        <p className="text-sm text-zinc-500 mb-4">
          If you were given a preset password, change it here to something only you know.
        </p>
        <ChangePasswordForm />
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-1">
          Sending email (Gmail)
        </h2>
        <p className="text-sm text-zinc-500 mb-4">
          Connect your Gmail so emails and sequence steps you send from the ATS go
          out from your own address. A connected mailbox is required to send.
        </p>
        <MailboxSection
          status={mailboxStatus}
          justConnected={sp.email_connected === "1"}
          errorCode={sp.email_error ?? null}
        />
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-1">
          Connect Outlook / API tokens
        </h2>
        <p className="text-sm text-zinc-500 mb-4">
          Generate a token to paste into the <strong>Add to ATS</strong> Outlook
          add-in (or the Chrome extension). Captures made with your token are
          attributed to you and land in your workspace. Keep it private — anyone
          with the token can add to your workspace. The token is shown once at
          creation.
        </p>
        <TokensTable tokens={tokens} />
      </section>
    </main>
  );
}
