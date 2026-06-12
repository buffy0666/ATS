import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Self-serve signup is disabled for now — workspace creation goes through
 * Dogfood Dev (platform admins use /platform/organizations/new). The old
 * form lives in SignupForm.tsx / actions.ts, untouched, so re-enabling is
 * just restoring the form render here.
 */
export default async function SignupPage() {
  // If you're already signed in, /signup is a noop — bounce home.
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">Workspace creation is disabled</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Please reach out to Dogfood Dev for workspace creation.
        </p>
        <p className="text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-900 dark:text-zinc-100 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
