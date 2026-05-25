import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignupForm } from "./SignupForm";

/**
 * Self-serve signup. Creates an Organization + ADMIN user in a transaction
 * (see actions.ts), then sends the user to /login with a pre-filled email
 * so they sign in immediately. We don't auto-sign-in via NextAuth because
 * the credentials flow expects a separate request/response cycle and
 * works more reliably with an explicit form submit.
 */
export default async function SignupPage() {
  // If you're already signed in, /signup is a noop — bounce home.
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">Create your workspace</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Spin up an ATS for your recruiting team. Free to try.
        </p>
        <SignupForm />
        <p className="mt-6 text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-900 dark:text-zinc-100 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
