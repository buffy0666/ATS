/**
 * One-time backfill: ensure every workspace (Organization) has at least one
 * OWNER. Workspaces created before the "first admin becomes owner" rule could
 * end up with only ADMINs/RECRUITERs (e.g. the platform-default admin path),
 * which locks everyone out of owner-only settings.
 *
 * For each ownerless org we promote a single user to OWNER, preferring:
 *   1. the earliest-created REAL (non platform-default) ADMIN,
 *   2. else the earliest-created REAL user of any role,
 *   3. else the platform-default admin (synthetic),
 * and set Organization.ownerUserId if it's empty.
 *
 * Read-only by default — prints the plan. Pass --apply to write.
 *   npx tsx scripts/backfill-workspace-owners.ts          # dry run
 *   npx tsx scripts/backfill-workspace-owners.ts --apply  # execute
 */
import { config } from "dotenv";
config();

import { PrismaClient, Role } from "../src/generated/prisma";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const PLATFORM_DEFAULT_SUFFIX = ".platform-default.local";
const isPlatformDefault = (email: string | null) =>
  !!email && email.endsWith(PLATFORM_DEFAULT_SUFFIX);

async function main() {
  console.log(`=== Backfill workspace owners (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      ownerUserId: true,
      users: {
        select: { id: true, email: true, role: true, active: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  let fixed = 0;
  let alreadyOk = 0;
  let noCandidate = 0;

  for (const org of orgs) {
    const owners = org.users.filter((u) => u.role === Role.OWNER);
    if (owners.length > 0) {
      alreadyOk++;
      continue;
    }

    const active = org.users.filter((u) => u.active);
    const realAdmins = active.filter((u) => u.role === Role.ADMIN && !isPlatformDefault(u.email));
    const realAny = active.filter((u) => !isPlatformDefault(u.email));
    const defaultAdmins = active.filter(
      (u) => u.role === Role.ADMIN && isPlatformDefault(u.email),
    );

    const pick =
      realAdmins[0] ?? realAny[0] ?? defaultAdmins[0] ?? null;

    if (!pick) {
      noCandidate++;
      console.log(`SKIP  | ${org.name} (${org.slug}) — ownerless, no promotable user`);
      continue;
    }

    const reason =
      pick === realAdmins[0]
        ? "earliest real admin"
        : pick === realAny[0]
          ? "earliest real user (no admin)"
          : "platform-default admin (no real users)";

    console.log(
      `FIX   | ${org.name} (${org.slug}) — promote ${pick.email} [${pick.role} -> OWNER] (${reason})` +
        (org.ownerUserId ? "" : " + set ownerUserId"),
    );

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        if (pick.role !== Role.OWNER) {
          await tx.user.update({ where: { id: pick.id }, data: { role: Role.OWNER } });
        }
        await tx.organization.updateMany({
          where: { id: org.id, ownerUserId: null },
          data: { ownerUserId: pick.id },
        });
      });
    }
    fixed++;
  }

  console.log(
    `\nSummary: ${orgs.length} orgs — ${alreadyOk} already have an owner, ${fixed} ${
      APPLY ? "fixed" : "to fix"
    }, ${noCandidate} ownerless with no candidate.`,
  );
  if (!APPLY && fixed > 0) console.log("\nDry run only. Re-run with --apply to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
