/**
 * Copy all KnowledgeItems (with attachment records) from one org to another.
 *
 * Usage:
 *   npx tsx scripts/copy-knowledge-between-orgs.ts <sourceOrgId> <targetOrgId>
 *
 * Notes:
 *  - Attachment rows are duplicated but point at the same stored file URL —
 *    the underlying blob is not copied.
 *  - createdById/uploadedById are remapped to the target org's owner (users
 *    are org-scoped, so source creator IDs would be cross-org references).
 *  - clientId is dropped — clients differ between orgs.
 *  - Idempotent by item name: items whose name already exists in the target
 *    org's KB are skipped.
 */

import { config } from "dotenv";
config();

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const [sourceOrgId, targetOrgId] = [process.argv[2], process.argv[3]];
if (!sourceOrgId || !targetOrgId) {
  console.error("Usage: npx tsx scripts/copy-knowledge-between-orgs.ts <sourceOrgId> <targetOrgId>");
  process.exit(1);
}

async function main() {
  const [source, target] = await Promise.all([
    prisma.organization.findUnique({ where: { id: sourceOrgId } }),
    prisma.organization.findUnique({ where: { id: targetOrgId } }),
  ]);
  if (!source || !target) {
    console.error(`Org not found: ${!source ? sourceOrgId : targetOrgId}`);
    process.exit(1);
  }
  console.log(`Copying knowledge base: "${source.name}" -> "${target.name}"`);

  const items = await prisma.knowledgeItem.findMany({
    where: { organizationId: sourceOrgId },
    include: { attachments: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Found ${items.length} knowledge items in source.`);

  const existing = await prisma.knowledgeItem.findMany({
    where: { organizationId: targetOrgId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((e) => e.name));

  const targetOwnerId = target.ownerUserId ?? null;

  let copied = 0;
  let skipped = 0;
  for (const item of items) {
    if (existingNames.has(item.name)) {
      skipped++;
      continue;
    }
    await prisma.knowledgeItem.create({
      data: {
        organizationId: targetOrgId,
        name: item.name,
        description: item.description,
        category: item.category,
        type: item.type,
        content: item.content,
        url: item.url,
        status: item.status,
        createdById: targetOwnerId,
        attachments: {
          create: item.attachments.map((a) => ({
            name: a.name,
            url: a.url,
            size: a.size,
            mimeType: a.mimeType,
            uploadedById: targetOwnerId,
          })),
        },
      },
    });
    copied++;
    console.log(`  copied: [${item.category ?? "no category"}] ${item.name}` +
      (item.attachments.length ? ` (${item.attachments.length} attachment(s))` : ""));
  }

  console.log(`Done. ${copied} copied, ${skipped} skipped (name already exists in target).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
