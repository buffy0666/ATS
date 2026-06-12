/**
 * Seed default ChoiceOptions for every org × every registered choice field.
 *
 * Usage:
 *   npx tsx scripts/backfill-choice-defaults.ts
 *
 * Context: the original global @@unique([field, name]) on ChoiceOption meant
 * only the FIRST org to seed a field got its defaults — every later org's
 * createMany(skipDuplicates) silently dropped all rows, leaving empty choice
 * lists (no Rejection Reasons / Degree levels / etc. in newer workspaces).
 * After the index became per-org, this backfills everyone. Idempotent —
 * ensureChoiceDefaults skips any org+field that already has rows.
 */

import { config } from "dotenv";
config();

import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

// Mirror of CHOICE_FIELDS in src/lib/choices.ts (not imported — that module
// is "server-only" and pulls in the app's prisma singleton).
const FIELDS: Array<{ key: string; defaults: string[] }> = [
  {
    key: "candidate.source",
    defaults: ["LINKEDIN", "REFERRAL", "JOB_BOARD", "AGENCY", "INBOUND", "OUTBOUND", "CAREER_SITE", "EVENT", "RECRUITER_NETWORK", "OTHER"],
  },
  {
    key: "candidate.seniority",
    defaults: ["INTERN", "ENTRY", "JUNIOR", "MID", "SENIOR", "STAFF", "PRINCIPAL", "LEAD", "MANAGER", "SENIOR_MANAGER", "DIRECTOR", "VP", "C_LEVEL"],
  },
  {
    key: "candidate.rejectionReason",
    defaults: ["Compensation", "Location / Relocation", "Remote Policy", "Role Fit", "Timing", "Accepted Another Offer", "Counteroffer", "Company / Industry Fit", "Visa / Sponsorship", "Contract vs Perm", "Benefits", "Other"],
  },
  {
    key: "candidate.educationDegree",
    defaults: ["HIGH_SCHOOL", "GED", "SOME_COLLEGE", "VOCATIONAL", "BOOTCAMP", "ASSOCIATE", "BACHELORS", "POSTGRAD_CERTIFICATE", "MASTERS", "MBA", "PROFESSIONAL", "DOCTORATE", "POSTDOCTORATE", "CERTIFICATE", "OTHER"],
  },
  {
    key: "candidate.certificationKind",
    defaults: ["CERTIFICATION", "LICENSE", "SECURITY_CLEARANCE", "ACCREDITATION", "MEMBERSHIP", "OTHER"],
  },
];

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });
  for (const org of orgs) {
    for (const f of FIELDS) {
      const existing = await prisma.choiceOption.count({
        where: { field: f.key, organizationId: org.id },
      });
      if (existing > 0) continue;
      await prisma.choiceOption.createMany({
        data: f.defaults.map((name, index) => ({
          field: f.key,
          name,
          sortOrder: index,
          organizationId: org.id,
        })),
        skipDuplicates: true,
      });
      console.log(`  seeded ${f.key} (${f.defaults.length}) for "${org.name}"`);
    }
  }

  // Summary: per-org counts per field.
  const counts = await prisma.choiceOption.groupBy({
    by: ["organizationId", "field"],
    _count: true,
  });
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  for (const c of counts.sort((a, b) =>
    `${orgName.get(a.organizationId ?? "")}${a.field}`.localeCompare(`${orgName.get(b.organizationId ?? "")}${b.field}`),
  )) {
    console.log(`${(orgName.get(c.organizationId ?? "") ?? "(no org)").padEnd(24)} ${c.field.padEnd(32)} ${c._count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
