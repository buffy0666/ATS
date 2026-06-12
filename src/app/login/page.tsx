import { LoginForm } from "./LoginForm";

/**
 * The /signup flow redirects here with ?email=...&fresh=1 after creating a
 * new workspace, so a brand-new owner sees a "welcome, sign in to your new
 * workspace" hint instead of a generic sign-in screen.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; fresh?: string; workspace_deleted?: string }>;
}) {
  const { email, fresh, workspace_deleted: workspaceDeleted } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
        {workspaceDeleted && (
          <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            Your workspace has been permanently deleted.
          </div>
        )}
        <h1 className="text-xl font-semibold mb-1">
          {fresh ? "Workspace created" : "Sign in"}
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          {fresh
            ? "Sign in to your new workspace to get started."
            : "Use your ATS account."}
        </p>
        <LoginForm defaultEmail={email ?? ""} />
        {!fresh && (
          <p className="mt-6 text-sm text-zinc-500">
            New here? Please reach out to Dogfood Dev for workspace creation.
          </p>
        )}
      </div>
    </main>
  );
}
