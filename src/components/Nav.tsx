import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function Nav() {
  const session = await auth();
  if (!session?.user) return null;

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight">
            ATS
          </Link>
          <Link href="/jobs" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">
            Jobs
          </Link>
          <Link href="/candidates" className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white">
            Candidates
          </Link>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">
            {session.user.email}{" "}
            <span className="ml-1 rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-xs uppercase tracking-wide">
              {session.user.role}
            </span>
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
