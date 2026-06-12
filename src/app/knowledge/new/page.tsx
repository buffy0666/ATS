import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminOrAbove, requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { KnowledgeForm } from "../KnowledgeForm";
import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_SECTION_CATEGORIES } from "../constants";

export default async function NewKnowledgeItemPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; category?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { orgId } = await requireSessionWithOrg();
  const sp = await searchParams;

  const isAdmin = isAdminOrAbove(session.user.role);

  const clients = await prisma.client.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // When launched from a client's page (?clientId=…), lock the form to that
  // client. Otherwise the form shows a client picker ("No client" included).
  const lockedClient = sp.clientId
    ? clients.find((c) => c.id === sp.clientId) ?? null
    : null;

  const requestedCategory =
    sp.category && (KNOWLEDGE_CATEGORIES as readonly string[]).includes(sp.category)
      ? sp.category
      : undefined;
  // Recruiters can't author admin-only section categories, so never preset one
  // for them (the form also omits these options below).
  const defaultCategory =
    requestedCategory &&
    !isAdmin &&
    (KNOWLEDGE_SECTION_CATEGORIES as readonly string[]).includes(requestedCategory)
      ? undefined
      : requestedCategory;

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <Link href="/knowledge" className="text-sm text-zinc-500 hover:underline">
        ← Knowledge base
      </Link>
      <h1 className="mt-1 text-2xl font-semibold mb-6">Add knowledge item</h1>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <KnowledgeForm
          isAdmin={isAdmin}
          clients={clients}
          lockedClient={lockedClient}
          defaultCategory={defaultCategory}
        />
      </div>
    </main>
  );
}
