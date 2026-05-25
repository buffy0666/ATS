import Link from "next/link";
import { NewOrganizationForm } from "./NewOrganizationForm";

/**
 * Platform-admin flow for sales-led customer onboarding.
 *
 * Creates a fresh Organization (no owner yet) and emails an invitation to
 * the designated owner. They click the magic link, set a password, and
 * become the founding ADMIN + ownerUserId.
 */
export default function NewOrganizationPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">Create a new tenant</h2>
          <p className="text-sm text-zinc-500 mt-1">
            For sales-led onboarding. The invitee gets a magic link, sets their
            password, and becomes the founding admin + owner of the workspace.
          </p>
        </div>
        <Link
          href="/platform/organizations"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          ← All organizations
        </Link>
      </div>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 max-w-xl">
        <NewOrganizationForm />
      </div>
    </div>
  );
}
