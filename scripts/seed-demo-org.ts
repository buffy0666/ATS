/**
 * Seed an Organization with realistic-looking demo data.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-org.ts <orgId>
 *
 * The script is idempotent: if the org already has more than 5 candidates
 * it exits without writing anything, so re-running on a populated demo
 * is safe.
 *
 * Every row is created with organizationId = <orgId>. Phase 6 will flip
 * organizationId NOT NULL across the schema; this script already writes
 * it everywhere so it'll keep working without changes.
 *
 * Notes-on-author: notes require authorId and interviews require
 * organizerId. The script uses the org's ownerUser (or the first user
 * scoped to the org if no owner is set). If the org has no users at all,
 * notes and interviews are skipped with a warning — everything else
 * still seeds.
 *
 * Tags: Tag.name is still globally unique (Phase 1-5). To avoid clashes
 * with tags in other orgs we prefix demo tag names with a short random
 * suffix per run.
 */

import { config } from "dotenv";
config();

import {
  CandidateSource,
  CandidateStatus,
  ClientStatus,
  CompanySize,
  ContactRole,
  ContactStatus,
  InterviewStatus,
  InterviewType,
  JobStatus,
  PrismaClient,
  RevenueBand,
  Seniority,
  Stage,
} from "../src/generated/prisma";

const prisma = new PrismaClient();

const orgId = process.argv[2];
if (!orgId) {
  console.error("Usage: npx tsx scripts/seed-demo-org.ts <orgId>");
  process.exit(1);
}

// ---------- Data tables ----------

const FIRST_NAMES = [
  "Aiden", "Sarah", "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan",
  "Sophia", "Lucas", "Mia", "Mason", "Isabella", "Logan", "Amelia",
  "Carter", "Harper", "Wyatt", "Evelyn", "Jackson", "Aisha", "Diego",
  "Priya", "Kenji", "Fatima", "Yusuf", "Camila", "Arjun", "Zara",
  "Mateo", "Hana", "Theo", "Ines", "Rafael", "Soraya", "Tomas",
  "Anika", "Bilal", "Clara", "Damian",
];

const LAST_NAMES = [
  "Chen", "Rodriguez", "Patel", "Johnson", "Nguyen", "Singh", "Garcia",
  "Kim", "Brown", "Williams", "Davis", "Tanaka", "O'Brien", "Hernandez",
  "Khan", "Sato", "Lopez", "Wilson", "Schmidt", "Park", "Anderson",
  "Mehta", "Walker", "Cohen", "Russo", "Ahmed", "Kowalski", "Petrov",
  "Bauer", "Mendez", "Saito", "Diaz", "Reyes", "Müller", "Yamamoto",
  "Adebayo", "Romero", "Ivanova", "Larsen", "Okonkwo",
];

const CLIENTS: Array<{
  name: string;
  industry: string;
  location: string;
  status: ClientStatus;
  companySize: CompanySize;
  revenueBand: RevenueBand;
  website: string;
}> = [
  {
    name: "Stratoscale Robotics",
    industry: "Industrial robotics",
    location: "Boston, MA",
    status: ClientStatus.ACTIVE,
    companySize: CompanySize.FIFTY_ONE_TO_TWO_HUNDRED,
    revenueBand: RevenueBand.TEN_TO_50M,
    website: "https://stratoscale-robotics.example.com",
  },
  {
    name: "Lumen Capital",
    industry: "Financial services",
    location: "New York, NY",
    status: ClientStatus.ACTIVE,
    companySize: CompanySize.TWO_HUNDRED_ONE_TO_FIVE_HUNDRED,
    revenueBand: RevenueBand.FIFTY_TO_250M,
    website: "https://lumen-capital.example.com",
  },
  {
    name: "Northwind Health",
    industry: "Digital health",
    location: "Austin, TX",
    status: ClientStatus.ACTIVE,
    companySize: CompanySize.ELEVEN_TO_FIFTY,
    revenueBand: RevenueBand.ONE_TO_10M,
    website: "https://northwind-health.example.com",
  },
  {
    name: "Halcyon Studios",
    industry: "Games",
    location: "Los Angeles, CA",
    status: ClientStatus.PROSPECT,
    companySize: CompanySize.FIFTY_ONE_TO_TWO_HUNDRED,
    revenueBand: RevenueBand.TEN_TO_50M,
    website: "https://halcyon-studios.example.com",
  },
  {
    name: "Quill & Quartz",
    industry: "Legal tech",
    location: "Chicago, IL",
    status: ClientStatus.ACTIVE,
    companySize: CompanySize.ELEVEN_TO_FIFTY,
    revenueBand: RevenueBand.ONE_TO_10M,
    website: "https://quillquartz.example.com",
  },
  {
    name: "Verdant Logistics",
    industry: "Supply chain",
    location: "Seattle, WA",
    status: ClientStatus.INACTIVE,
    companySize: CompanySize.FIVE_HUNDRED_ONE_TO_ONE_THOUSAND,
    revenueBand: RevenueBand.TWO_FIFTY_M_TO_1B,
    website: "https://verdant-logistics.example.com",
  },
];

const JOB_TITLES = [
  "Senior Backend Engineer",
  "Staff ML Engineer",
  "Product Designer",
  "Engineering Manager",
  "Site Reliability Engineer",
  "Frontend Engineer",
  "Data Platform Engineer",
  "Security Engineer",
  "Mobile Engineer (iOS)",
  "Solutions Architect",
  "Product Manager",
  "Engineering Lead",
];

const TAG_BASE = [
  "Senior IC",
  "DevOps",
  "Open to Remote",
  "Bilingual EN/ES",
  "Top 10%",
  "Referred",
  "Ex-FAANG",
  "Backend",
];

const EMAIL_TEMPLATES = [
  {
    name: "Welcome — initial outreach",
    subject: "Quick intro re: {{job_title}} at {{client_name}}",
    body:
      "Hi {{first_name}},\n\nI'm working on a {{job_title}} role with {{client_name}} that I think could be interesting given your background. Open to a quick chat this week?\n\nBest,\n{{recruiter_name}}",
  },
  {
    name: "Reject — politely decline",
    subject: "Update on the {{job_title}} role",
    body:
      "Hi {{first_name}},\n\nThanks for the time you put into the {{job_title}} interview at {{client_name}}. The team decided to move forward with another candidate this round. I'll keep you in mind for future roles that fit better.\n\nBest,\n{{recruiter_name}}",
  },
  {
    name: "Schedule interview",
    subject: "Next step: interview for {{job_title}}",
    body:
      "Hi {{first_name}},\n\nGreat news — {{client_name}} would like to schedule a {{interview_type}} for the {{job_title}} role. Do any of these times work?\n\n• Option A\n• Option B\n• Option C\n\nBest,\n{{recruiter_name}}",
  },
];

const NOTE_SNIPPETS = [
  "Strong technical signal — walked through system design for a real-time pricing service end to end.",
  "Comp ask is at the top of the band; flagged to hiring manager.",
  "Open to relocation but prefers remote. 2-week notice.",
  "Phone screen went well; recommended for onsite. Check refs before offer.",
  "Pulled from the screen — communication was rough and answers were shallow.",
  "Excellent culture fit. Asked thoughtful questions about team dynamics.",
  "Currently interviewing at two competitors; need to move fast if we want to make an offer.",
  "Solid backend chops. Less experience with cloud-native than the JD asks for but a quick learner per references.",
  "Hold for the next cycle — not a fit for the current opening but worth keeping warm.",
  "Sent the take-home; due Friday. Will follow up Monday if not received.",
];

// ---------- Helpers ----------

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function chance(p: number): boolean {
  return Math.random() < p;
}

function randomSuffix(n = 6): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

function emailFor(first: string, last: string, salt: string): string {
  return `${first.toLowerCase().replace(/[^a-z]/g, "")}.${last.toLowerCase().replace(/[^a-z]/g, "")}.${salt}@demo-ats.example`;
}

function linkedinFor(first: string, last: string, salt: string): string {
  return `https://www.linkedin.com/in/${first.toLowerCase().replace(/[^a-z]/g, "")}-${last.toLowerCase().replace(/[^a-z]/g, "")}-${salt}/`;
}

// ---------- Main ----------

async function main() {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    console.error(`Organization ${orgId} not found.`);
    process.exit(1);
  }

  const existing = await prisma.candidate.count({ where: { organizationId: orgId } });
  if (existing > 5) {
    console.log(`Org ${org.name} (${orgId}) already has ${existing} candidates — already seeded. Exiting.`);
    return;
  }

  // Pick a user to attribute authored content to. Prefer the org owner;
  // fall back to any user in the org. Without one we skip notes + interviews.
  const owner =
    (org.ownerUserId
      ? await prisma.user.findUnique({ where: { id: org.ownerUserId } })
      : null) ??
    (await prisma.user.findFirst({
      where: { organizationId: orgId, active: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!owner) {
    console.warn(
      `⚠️  No user found for org ${orgId}. Notes + interviews will be skipped (they require authorId/organizerId).`,
    );
  }

  console.log(`Seeding demo data into ${org.name} (${orgId})…`);

  // --- Tags (8). Tag.name is still globally unique — suffix to avoid clashes.
  const tagSalt = randomSuffix(4);
  const tagRows = await Promise.all(
    TAG_BASE.map((base) =>
      prisma.tag.create({
        data: {
          name: `${base} #${tagSalt}`,
          color: pick(["zinc", "blue", "emerald", "amber", "rose", "violet"]),
          organizationId: orgId,
        },
      }),
    ),
  );
  console.log(`  Tags: ${tagRows.length}`);

  // --- Clients (6).
  const clientRows = await Promise.all(
    CLIENTS.map((c) =>
      prisma.client.create({
        data: {
          name: c.name,
          industry: c.industry,
          location: c.location,
          status: c.status,
          companySize: c.companySize,
          revenueBand: c.revenueBand,
          website: c.website,
          ownerId: owner?.id ?? null,
          organizationId: orgId,
        },
      }),
    ),
  );
  console.log(`  Clients: ${clientRows.length}`);

  // --- Client contacts (~5 per client).
  let contactCount = 0;
  for (const client of clientRows) {
    const contactsPerClient = 4 + Math.floor(Math.random() * 3); // 4-6
    for (let i = 0; i < contactsPerClient; i++) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const salt = randomSuffix(4);
      await prisma.clientContact.create({
        data: {
          clientId: client.id,
          firstName: first,
          lastName: last,
          email: emailFor(first, last, salt),
          phone: chance(0.6) ? `+1-555-${Math.floor(1000 + Math.random() * 9000)}` : null,
          title: pick([
            "VP of Engineering",
            "Director of Engineering",
            "Head of Talent",
            "Recruiting Manager",
            "Hiring Manager",
            "CTO",
            "CEO",
            "Engineering Lead",
          ]),
          department: pick(["Engineering", "Talent", "Product", "Operations"]),
          role: chance(0.5) ? ContactRole.DECISION_MAKER : ContactRole.INFLUENCER,
          status: ContactStatus.ACTIVE,
          organizationId: orgId,
        },
      });
      contactCount++;
    }
  }
  console.log(`  Client contacts: ${contactCount}`);

  // --- Jobs (12).
  const jobRows: Array<{ id: string; clientId: string }> = [];
  for (let i = 0; i < 12; i++) {
    const client = pick(clientRows);
    const status = chance(0.7) ? JobStatus.OPEN : JobStatus.CLOSED;
    const salaryLow = 110_000 + Math.floor(Math.random() * 80) * 1_000;
    const salaryHigh = salaryLow + 20_000 + Math.floor(Math.random() * 60) * 1_000;
    const job = await prisma.job.create({
      data: {
        title: JOB_TITLES[i % JOB_TITLES.length],
        department: pick(["Engineering", "Design", "Product", "Data"]),
        location: client.location,
        description:
          "We're hiring for a senior contributor who's owned production systems end to end. The team values pragmatic design, clear writing, and shipping. This is a hybrid role.",
        status,
        salaryLow,
        salaryHigh,
        placementFeePercent: pick([18, 20, 22, 25]),
        clientId: client.id,
        createdById: owner?.id ?? null,
        organizationId: orgId,
      },
      select: { id: true, clientId: true },
    });
    jobRows.push({ id: job.id, clientId: job.clientId ?? client.id });
  }
  console.log(`  Jobs: ${jobRows.length}`);

  // --- Candidates (40).
  const candidateRows: Array<{ id: string; firstName: string; lastName: string }> = [];
  const usedPairs = new Set<string>();
  while (candidateRows.length < 40) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const pairKey = `${first} ${last}`;
    if (usedPairs.has(pairKey)) continue;
    usedPairs.add(pairKey);
    const salt = randomSuffix(6);

    const cand = await prisma.candidate.create({
      data: {
        firstName: first,
        lastName: last,
        email: emailFor(first, last, salt),
        linkedinUrl: linkedinFor(first, last, salt),
        phone: chance(0.7) ? `+1-555-${Math.floor(1000 + Math.random() * 9000)}` : null,
        locationCity: pick([
          "Seattle", "San Francisco", "Austin", "Brooklyn", "Chicago",
          "Denver", "Boston", "Atlanta", "Portland", "Remote",
        ]),
        locationState: pick(["WA", "CA", "TX", "NY", "IL", "CO", "MA", "GA", "OR", null]),
        locationCountry: "US",
        currentTitle: pick([
          "Senior Software Engineer",
          "Staff Engineer",
          "Engineering Manager",
          "Tech Lead",
          "Senior Designer",
          "Principal Engineer",
          "Senior PM",
          "Backend Engineer",
        ]),
        currentCompany: pick([
          "Cloudpath", "Brightline", "Octave AI", "Mosaic Labs",
          "Riverbend", "Sentinel Health", "Folio", "NorthArc",
        ]),
        yearsExperience: 3 + Math.floor(Math.random() * 18),
        seniority: pick([
          Seniority.MID,
          Seniority.SENIOR,
          Seniority.STAFF,
          Seniority.PRINCIPAL,
          Seniority.LEAD,
        ]),
        status: chance(0.85) ? CandidateStatus.ACTIVE : pick([
          CandidateStatus.PASSIVE,
          CandidateStatus.PLACED,
          CandidateStatus.ON_HOLD,
        ]),
        source: pick([
          CandidateSource.LINKEDIN,
          CandidateSource.REFERRAL,
          CandidateSource.INBOUND,
          CandidateSource.RECRUITER_NETWORK,
        ]),
        summary:
          "Hands-on engineer with strong production ownership across distributed systems and developer tooling. Looks for high-leverage problems and steady-state teams.",
        rating: chance(0.6) ? 3 + Math.floor(Math.random() * 3) : null,
        sourcedById: owner?.id ?? null,
        organizationId: orgId,
      },
      select: { id: true, firstName: true, lastName: true },
    });

    // Attach 1-3 random tags to ~70% of candidates.
    if (chance(0.7)) {
      const tagsToAttach = pickN(tagRows, 1 + Math.floor(Math.random() * 3));
      await prisma.candidate.update({
        where: { id: cand.id },
        data: { tags: { connect: tagsToAttach.map((t) => ({ id: t.id })) } },
      });
    }

    candidateRows.push(cand);
  }
  console.log(`  Candidates: ${candidateRows.length}`);

  // --- Applications (~60). Distribute by stage: heavier toward early.
  // Mostly APPLIED/SCREEN, fewer at OFFER/HIRED, a couple REJECTED.
  const STAGE_WEIGHTS: Array<{ stage: Stage; weight: number }> = [
    { stage: Stage.APPLIED, weight: 22 },
    { stage: Stage.SCREEN, weight: 18 },
    { stage: Stage.INTERVIEW, weight: 11 },
    { stage: Stage.OFFER, weight: 4 },
    { stage: Stage.HIRED, weight: 3 },
    { stage: Stage.REJECTED, weight: 2 },
  ];
  function weightedStage(): Stage {
    const total = STAGE_WEIGHTS.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const { stage, weight } of STAGE_WEIGHTS) {
      r -= weight;
      if (r <= 0) return stage;
    }
    return Stage.APPLIED;
  }

  const appPairs = new Set<string>();
  const applicationRows: Array<{ id: string; candidateId: string; jobId: string; stage: Stage }> = [];
  let appAttempts = 0;
  while (applicationRows.length < 60 && appAttempts < 200) {
    appAttempts++;
    const cand = pick(candidateRows);
    const job = pick(jobRows);
    const key = `${cand.id}:${job.id}`;
    if (appPairs.has(key)) continue;
    appPairs.add(key);
    const app = await prisma.application.create({
      data: {
        candidateId: cand.id,
        jobId: job.id,
        stage: weightedStage(),
        organizationId: orgId,
      },
      select: { id: true, candidateId: true, jobId: true, stage: true },
    });
    applicationRows.push(app);
  }
  console.log(`  Applications: ${applicationRows.length}`);

  // --- Notes (~10) — only if we have an author.
  if (owner) {
    const noteCount = 10;
    const noteTargets = pickN(candidateRows, noteCount);
    for (const cand of noteTargets) {
      await prisma.note.create({
        data: {
          candidateId: cand.id,
          authorId: owner.id,
          body: pick(NOTE_SNIPPETS),
          organizationId: orgId,
        },
      });
    }
    console.log(`  Notes: ${noteCount}`);
  } else {
    console.log("  Notes: skipped (no user for org)");
  }

  // --- Interviews (3) — only if we have an organizer.
  if (owner) {
    const eligibleApps = applicationRows.filter((a) =>
      a.stage === Stage.SCREEN || a.stage === Stage.INTERVIEW || a.stage === Stage.OFFER,
    );
    const ivCount = Math.min(3, eligibleApps.length);
    const ivTargets = pickN(eligibleApps, ivCount);
    let placed = 0;
    for (const app of ivTargets) {
      const cand = candidateRows.find((c) => c.id === app.candidateId);
      const daysOut = 1 + Math.floor(Math.random() * 7);
      const start = new Date();
      start.setDate(start.getDate() + daysOut);
      start.setHours(10 + Math.floor(Math.random() * 7), 0, 0, 0);
      const end = new Date(start.getTime() + 45 * 60 * 1000);
      await prisma.interview.create({
        data: {
          applicationId: app.id,
          candidateId: app.candidateId,
          title: `${cand ? `${cand.firstName} ${cand.lastName}` : "Candidate"} — phone screen`,
          type: pick([InterviewType.PHONE_SCREEN, InterviewType.TECHNICAL, InterviewType.CULTURE_FIT]),
          status: InterviewStatus.SCHEDULED,
          startAt: start,
          endAt: end,
          videoUrl: "https://meet.example.com/demo-room",
          organizerId: owner.id,
          organizationId: orgId,
        },
      });
      placed++;
    }
    console.log(`  Interviews: ${placed}`);
  } else {
    console.log("  Interviews: skipped (no user for org)");
  }

  // --- Email templates (3).
  for (const t of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.create({
      data: {
        name: t.name,
        subject: t.subject,
        body: t.body,
        createdById: owner?.id ?? null,
        organizationId: orgId,
      },
    });
  }
  console.log(`  Email templates: ${EMAIL_TEMPLATES.length}`);

  console.log(`✅ Seeded ${org.name} (${orgId}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
