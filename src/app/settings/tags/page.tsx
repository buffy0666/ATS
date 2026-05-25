import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { TagsTable, type TagRow } from "./TagsTable";

export default async function TagsSettingsPage() {
  const { orgId } = await requireSessionWithOrg();

  const tags = await prisma.tag.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { candidates: true, clients: true, contacts: true } },
    },
  });

  const rows: TagRow[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    candidateCount: t._count.candidates,
    clientCount: t._count.clients,
    contactCount: t._count.contacts,
  }));

  return <TagsTable tags={rows} />;
}
