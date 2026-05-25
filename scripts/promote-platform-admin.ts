/**
 * One-off CLI: promote an existing user to platform admin.
 *
 * Usage:
 *   npx tsx scripts/promote-platform-admin.ts <email>
 *   npx tsx scripts/promote-platform-admin.ts <email> --demote
 *
 * Notes:
 *  - The env var PLATFORM_ADMIN_EMAILS auto-promotes on every sign-in, so
 *    in production you'll usually just edit Vercel env. This script is
 *    for the bootstrap case (or for when you want the flag durably set in
 *    the DB regardless of env vars).
 *  - --demote flips the flag off. Has no special protection — be careful
 *    not to demote your last platform admin.
 */

import { config } from "dotenv";
config();

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const demote = args.includes("--demote");

  if (!email) {
    console.error(
      "Usage: npx tsx scripts/promote-platform-admin.ts <email> [--demote]",
    );
    process.exit(1);
  }

  const target = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, name: true, isPlatformAdmin: true },
  });
  if (!target) {
    console.error(`No user found with email ${email}.`);
    process.exit(1);
  }

  const desired = !demote;
  if (target.isPlatformAdmin === desired) {
    console.log(
      `User ${target.email} is already ${
        desired ? "" : "not "
      }a platform admin — no change.`,
    );
    return;
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isPlatformAdmin: desired },
    select: { email: true, isPlatformAdmin: true },
  });

  console.log(
    `${updated.email}: isPlatformAdmin = ${updated.isPlatformAdmin}.`,
  );
  console.log(
    "Note: the user must sign out and back in for the change to take effect (JWT session).",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
