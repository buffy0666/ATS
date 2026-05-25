import Link from "next/link";
import { requireCanCreateGlobalAdmin } from "@/lib/auth-utils";
import { NewGlobalAdminForm } from "./NewGlobalAdminForm";

/**
 * Restricted flow for minting new platform admins ("global admins") with
 * a password directly — no magic link, no email step. Gated to the
 * hardcoded GLOBAL_ADMIN_CREATOR_EMAILS allowlist (see lib/auth-utils).
 */
export default async function NewGlobalAdminPage() {
  await requireCanCreateGlobalAdmin();

  return (
    <main className="flex-1 max-w-xl mx-auto w-full px-6 py-10 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">New global admin</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Creates a platform-admin account with full SaaS-operator powers —
            cross-tenant visibility, impersonation, tenant creation.
          </p>
        </div>
        <Link
          href="/users"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          ← All users
        </Link>
      </div>

      <div className="rounded-md border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-3 text-xs text-purple-900 dark:text-purple-200">
        <p className="font-semibold mb-1">Heads up</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            The new user is placed in your current organization as a tenant ADMIN
            so they have a dogfooding context. You can move them later.
          </li>
          <li>
            They get <code>isPlatformAdmin = true</code> immediately — but the
            Platform sidebar only appears after they sign in (or sign out + back
            in if they were already signed in).
          </li>
          <li>
            Communicate the temporary password securely — e.g. 1Password share,
            Signal. We do <strong>not</strong> email it.
          </li>
        </ul>
      </div>

      <NewGlobalAdminForm />
    </main>
  );
}
