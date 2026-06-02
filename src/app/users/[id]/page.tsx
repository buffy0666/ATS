import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdminWithOrg } from "@/lib/auth-utils";
import { Role } from "@/generated/prisma";
import { RoleSelector } from "./RoleSelector";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { DeleteUserButton } from "./DeleteUserButton";
import { UserProfileFieldsForm } from "./UserProfileFieldsForm";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, orgId } = await requireAdminWithOrg();
  const { id } = await params;

  // findFirst (not findUnique) so we can compose id + organizationId —
  // an admin can only view/manage users in their own workspace.
  const user = await prisma.user.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      technologyComments: true,
      phoneSystems: true,
      phoneNumber: true,
      technologyNotes: true,
      profileComments: true,
    },
  });
  if (!user) notFound();

  const isSelf = user.id === session.user.id;

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10 space-y-6">
        <div>
          <Link href="/users" className="text-sm text-zinc-500 hover:underline">
            ← All users
          </Link>
          <h1 className="text-2xl font-semibold mt-1">{user.email}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {user.name ?? "No name set"} · added {user.createdAt.toLocaleDateString()}
            {isSelf && <span className="ml-2 text-xs uppercase tracking-wide text-amber-600">(you)</span>}
          </p>
        </div>

        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">Role</h2>
          <RoleSelector
            userId={user.id}
            role={user.role}
            isSelf={isSelf}
            viewerRole={(session.user.role as Role) ?? Role.RECRUITER}
          />
          {isSelf && (
            <p className="text-xs text-zinc-500 mt-2">
              You can&apos;t demote yourself — ask another admin to do it.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
            Reset password
          </h2>
          <ResetPasswordForm userId={user.id} />
        </section>

        <UserProfileFieldsForm
          userId={user.id}
          values={{
            technologyComments: user.technologyComments,
            phoneSystems: user.phoneSystems,
            phoneNumber: user.phoneNumber,
            technologyNotes: user.technologyNotes,
            profileComments: user.profileComments,
          }}
        />

        {!isSelf && (
          <section className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-red-700 dark:text-red-400 mb-3">
              Danger zone
            </h2>
            <DeleteUserButton userId={user.id} email={user.email} />
          </section>
        )}
    </main>
  );
}
