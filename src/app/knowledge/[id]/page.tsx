import Link from "next/link";
import { notFound } from "next/navigation";
import { KnowledgeStatus, Role } from "@/generated/prisma";
import { isAdminOrAbove, requireSessionWithOrg } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { AttachmentsSection, type AttachmentRow } from "./AttachmentsSection";

const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
};

const STATUS_BADGE: Record<KnowledgeStatus, string> = {
  UNDER_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
};

export default async function KnowledgeItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, orgId } = await requireSessionWithOrg();

  const item = await prisma.knowledgeItem.findFirst({
    where: { id, organizationId: orgId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      attachments: {
        orderBy: { uploadedAt: "asc" },
        include: { uploadedBy: { select: { name: true, email: true } } },
      },
    },
  });
  if (!item) notFound();

  const isAdmin = isAdminOrAbove((session.user.role as Role) ?? Role.RECRUITER);
  const isCreator = item.createdById === session.user.id;
  const canModify = isAdmin || isCreator;

  const attachments: AttachmentRow[] = item.attachments.map((a) => ({
    id: a.id,
    name: a.name,
    url: a.url,
    size: a.size,
    mimeType: a.mimeType,
    uploadedAt: a.uploadedAt,
    uploadedBy: a.uploadedBy,
  }));

  return (
    <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
      <Link href="/knowledge" className="text-xs text-zinc-500 hover:underline">
        ← Knowledge base
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{item.name}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${STATUS_BADGE[item.status]}`}
        >
          {STATUS_LABEL[item.status]}
        </span>
        <span className="rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 px-2 py-0.5 text-xs font-medium">
          {item.type}
        </span>
        {item.category && (
          <span className="rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200 px-2 py-0.5 text-xs font-medium">
            {item.category}
          </span>
        )}
      </div>

      <div className="mt-1 text-xs text-zinc-500">
        Added by {item.createdBy?.name ?? item.createdBy?.email ?? "—"} ·{" "}
        {item.createdAt.toLocaleDateString()}
      </div>

      {item.description && (
        <p className="mt-4 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words">
          {item.description}
        </p>
      )}

      {item.url && (
        <div className="mt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Link
          </span>
          <div className="mt-1">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {item.url}
            </a>
          </div>
        </div>
      )}

      <div className="mt-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <AttachmentsSection itemId={item.id} attachments={attachments} canModify={canModify} />
      </div>
    </main>
  );
}
