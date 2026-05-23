import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CandidateForm } from "./CandidateForm";

export default async function NewCandidatePage() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const [users, contacts, allTags] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.clientContact.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ client: { name: "asc" } }, { lastName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        client: { select: { name: true } },
      },
    }),
    prisma.tag.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const contactOptions = contacts.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    clientName: c.client.name,
  }));

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">New candidate</h1>
      <CandidateForm
        users={users}
        contacts={contactOptions}
        allTags={allTags}
        currentUserId={session.user.id ?? ""}
      />
    </main>
  );
}
