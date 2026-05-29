import Link from "next/link";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { Role } from "@/generated/prisma";
import { InviteTeammateForm } from "./InviteTeammateForm";

/**
 * Tenant-admin flow for inviting teammates by magic link. Lives parallel
 * to /users/new — the difference is no password is set or emailed; the
 * invitee picks their own when they click the link.
 */
export default async function InviteUserPage() {
  const { session } = await requireAdminWithOrg();

  return (
    <main className="flex-1 max-w-xl mx-auto w-full px-6 py-10 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Invite teammate</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Send a magic-link invitation. The invitee sets their own password —
            you never see it.
          </p>
        </div>
        <Link
          href="/users"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          ← All users
        </Link>
      </div>
      <InviteTeammateForm viewerRole={(session.user.role as Role) ?? Role.RECRUITER} />
      <p className="text-xs text-zinc-500">
        Prefer to set a password yourself?{" "}
        <Link href="/users/new" className="underline">
          Create user with a temporary password
        </Link>{" "}
        instead.
      </p>
    </main>
  );
}
