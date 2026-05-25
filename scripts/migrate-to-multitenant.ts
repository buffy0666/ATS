/**
 * One-shot migration to multi-tenant Phase 1.
 *
 * Backfills every existing row with a `Default Organization`. The very
 * first ADMIN user becomes the org's owner. Idempotent: re-running is
 * safe — it'll only fill in nulls, never overwrite an existing org.
 *
 * Usage:
 *   npm run migrate:multitenant         # dry run, prints what would change
 *   npm run migrate:multitenant -- --apply
 *
 * Run this ONCE per environment (dev DB + prod Supabase). After it
 * finishes, every existing record has an organizationId and queries can
 * start filtering by org in Phase 3 without orphaning data.
 */

import { config } from "dotenv";
config();

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

const DEFAULT_ORG_SLUG = "default";
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "dry run"}`);
  console.log("");

  // 1. Ensure the Default org exists.
  let org = await prisma.organization.findUnique({ where: { slug: DEFAULT_ORG_SLUG } });
  if (!org) {
    if (!APPLY) {
      console.log("Would create Organization { slug: 'default', name: 'Default' }");
    } else {
      org = await prisma.organization.create({
        data: { slug: DEFAULT_ORG_SLUG, name: "Default" },
      });
      console.log(`Created Default Org (id=${org.id})`);
    }
  } else {
    console.log(`Default Org already exists (id=${org.id})`);
  }

  // 2. Pick the first ADMIN user as the org owner.
  const owner = await prisma.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!owner) {
    console.log("⚠️  No active ADMIN user found. Owner assignment skipped.");
  } else if (org && !org.ownerUserId) {
    if (!APPLY) {
      console.log(`Would set Default Org owner = ${owner.email}`);
    } else {
      await prisma.organization.update({
        where: { id: org.id },
        data: { ownerUserId: owner.id },
      });
      console.log(`Set Default Org owner = ${owner.email}`);
    }
  } else if (org) {
    console.log(`Default Org owner already set`);
  }

  // 3. For every tenant-scoped table, set organizationId where NULL.
  if (!org && APPLY) {
    throw new Error("No Default Org to assign rows to. Aborting.");
  }
  const orgId = org?.id ?? "(would-be-created-org-id)";

  const tables: { name: string; model: keyof PrismaClient }[] = [
    { name: "User", model: "user" },
    { name: "Tag", model: "tag" },
    { name: "ApiToken", model: "apiToken" },
    { name: "AIConfig", model: "aIConfig" },
    { name: "Job", model: "job" },
    { name: "Client", model: "client" },
    { name: "ClientContact", model: "clientContact" },
    { name: "Candidate", model: "candidate" },
    { name: "Application", model: "application" },
    { name: "Note", model: "note" },
    { name: "KnowledgeItem", model: "knowledgeItem" },
    { name: "EmailTemplate", model: "emailTemplate" },
    { name: "EmailLog", model: "emailLog" },
    { name: "Task", model: "task" },
    { name: "CandidateList", model: "candidateList" },
    { name: "SavedSearch", model: "savedSearch" },
    { name: "Interview", model: "interview" },
    { name: "ChoiceOption", model: "choiceOption" },
    { name: "Sequence", model: "sequence" },
    { name: "AssistantConversation", model: "assistantConversation" },
    { name: "CustomField", model: "customField" },
  ];

  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = prisma[t.model] as any;
    const remaining = await m.count({ where: { organizationId: null } });
    if (remaining === 0) {
      console.log(`  ${t.name.padEnd(24)} 0 rows need backfill`);
      continue;
    }
    if (!APPLY) {
      console.log(`  ${t.name.padEnd(24)} ${remaining} rows would be assigned to Default Org`);
    } else {
      const r = await m.updateMany({
        where: { organizationId: null },
        data: { organizationId: orgId },
      });
      console.log(`  ${t.name.padEnd(24)} ${r.count} rows assigned`);
    }
  }

  console.log("");
  if (APPLY) {
    console.log("✅ Migration complete. Every existing row now belongs to the Default Org.");
    console.log("   Next step: Phase 2 (auth scaffolding + session org context).");
  } else {
    console.log("Dry run only. Re-run with --apply to perform the writes.");
  }
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
