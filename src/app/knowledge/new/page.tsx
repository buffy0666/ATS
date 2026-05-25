import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Role } from "@/generated/prisma";
import { KnowledgeForm } from "../KnowledgeForm";

export default async function NewKnowledgeItemPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isAdmin = session.user.role === Role.ADMIN;

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <Link href="/knowledge" className="text-sm text-zinc-500 hover:underline">
        ← Knowledge base
      </Link>
      <h1 className="mt-1 text-2xl font-semibold mb-6">Add knowledge item</h1>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <KnowledgeForm isAdmin={isAdmin} />
      </div>
    </main>
  );
}
