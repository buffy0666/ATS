import Link from "next/link";
import { LoginForm } from "./LoginForm";

/**
 * The /signup flow redirects here with ?email=...&fresh=1 after creating a
 * new workspace, so a brand-new owner sees a "welcome, sign in to your new
 * workspace" hint instead of a generic sign-in screen.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; fresh?: string }>;
}) {
  const { email, fresh } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
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
            New here?{" "}
            <Link
              href="/signup"
              className="text-zinc-900 dark:text-zinc-100 font-medium hover:underline"
            >
              Create a workspace
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
