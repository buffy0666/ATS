import { requireSession } from "@/lib/auth-utils";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default async function ProfilePage() {
  const session = await requireSession();
  const { name, email, role } = session.user;

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
    </main>
  );
}
