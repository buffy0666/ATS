import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createClient } from "../actions";
import { ClientFormFields } from "../ClientFormFields";

export default async function NewClientPage() {
  const { orgId } = await requireSessionWithOrg();
  const [owners, allTags] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: orgId },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
    prisma.tag.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">New client</h1>
      <form
        action={createClient}
        className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
      >
        <ClientFormFields owners={owners} allTags={allTags} />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 text-sm font-medium"
        >
          Create client
        </button>
      </form>
    </main>
  );
}
