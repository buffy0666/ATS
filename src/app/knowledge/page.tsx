import Link from "next/link";
import { Role } from "@/generated/prisma";
import { requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { KnowledgeTable, type KnowledgeRow } from "./KnowledgeTable";
import { KNOWLEDGE_CATEGORIES } from "./constants";

export default async function KnowledgeBase({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { session, orgId } = await requireSessionWithOrg();
  const sp = await searchParams;

  // Optional category filter — backs the SOP / Sales Content / Marketing
  // Content sidebar "section" views. Only honored if it's a known category.
  const sectionCategory =
    sp.category && (KNOWLEDGE_CATEGORIES as readonly string[]).includes(sp.category)
      ? sp.category
      : null;

  const items = await prisma.knowledgeItem.findMany({
    where: {
      organizationId: orgId,
      ...(sectionCategory ? { category: sectionCategory } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      client: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
  });

  const rows: KnowledgeRow[] = items.map((it) => ({
    id: it.id,
    name: it.name,
    description: it.description,
    type: it.type,
    category: it.category,
    client: it.client,
    url: it.url,
    status: it.status,
    createdAt: it.createdAt,
    createdBy: it.createdBy,
    attachmentCount: it._count.attachments,
  }));

  const heading = sectionCategory ?? "Knowledge base";
  const newHref = sectionCategory
    ? `/knowledge/new?category=${encodeURIComponent(sectionCategory)}`
    : "/knowledge/new";

  return (
    <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {sectionCategory
              ? `${sectionCategory} items across the workspace.`
              : "Shared documents and links for the team."}
          </p>
        </div>
        <Link
          href={newHref}
          className="rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          + Add new item
        </Link>
      </div>

      <KnowledgeTable
        items={rows}
        currentUserId={session.user.id ?? ""}
        currentUserRole={(session.user.role as Role) ?? Role.RECRUITER}
      />
    </main>
  );
}
