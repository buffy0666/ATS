import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CreateOrganizationForm } from "./CreateOrganizationForm";

/**
 * Fallback page for users who are signed in but have no organizationId.
 *
 * Most users hit this once: they signed up before multi-tenant existed and
 * the migration script didn't catch them, OR they were created via an
 * out-of-band path (Prisma Studio, a test script, etc.). Self-serve
 * signup hands you an org on day one, so this should only fire rarely.
 *
 * requireSessionWithOrg() and requireAdminWithOrg() redirect here when the
 * session's organizationId is null — without this page they'd hit a 404.
 */
export default async function CreateOrganizationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // If you already have an org, you don't belong here.
  if (session.user.organizationId) redirect("/");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">Set up your workspace</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Your account doesn&apos;t belong to a workspace yet. Name it and we&apos;ll
          finish setting things up. You&apos;ll be the workspace owner and admin.
        </p>
        <CreateOrganizationForm />
      </div>
    </main>
  );
}
