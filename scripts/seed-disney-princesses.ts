/**
 * Seed the "HIK - Masis Staffing" org with a Walt Disney client, a
 * "Masis Princesses" job, and 20 Disney princess candidates applied to it.
 *
 * Usage:
 *   npx tsx scripts/seed-disney-princesses.ts <orgId>
 *
 * Idempotent: skips client/job/candidates that already exist by name/email.
 */

import { config } from "dotenv";
config();

import {
  CandidateStatus,
  ClientStatus,
  CompanySize,
  JobStatus,
  PrismaClient,
  RevenueBand,
  Stage,
} from "../src/generated/prisma";

const prisma = new PrismaClient();

const orgId = process.argv[2];
if (!orgId) {
  console.error("Usage: npx tsx scripts/seed-disney-princesses.ts <orgId>");
  process.exit(1);
}

const PRINCESSES: Array<{
  firstName: string;
  lastName: string;
  currentTitle: string;
  currentCompany: string;
  locationCity: string;
  locationState: string;
  skills: string[];
  yearsExperience: number;
  seniority: string;
  source: string;
  rating: number;
  stage: Stage;
  summary: string;
}> = [
  { firstName: "Snow", lastName: "White", currentTitle: "Hospitality Manager", currentCompany: "Seven Dwarfs Lodge", locationCity: "Burbank", locationState: "CA", skills: ["Housekeeping", "Team Leadership", "Baking"], yearsExperience: 8, seniority: "MANAGER", source: "REFERRAL", rating: 5, stage: Stage.INTERVIEW, summary: "The fairest in the field of hospitality; manages a tight-knit crew of seven." },
  { firstName: "Cinderella", lastName: "Tremaine", currentTitle: "Event Coordinator", currentCompany: "Royal Ballroom Events", locationCity: "Anaheim", locationState: "CA", skills: ["Event Planning", "Time Management", "Vendor Relations"], yearsExperience: 6, seniority: "MID", source: "LINKEDIN", rating: 5, stage: Stage.OFFER, summary: "Expert at executing flawless events under hard midnight deadlines." },
  { firstName: "Aurora", lastName: "Rose", currentTitle: "Wellness Consultant", currentCompany: "Briar Rose Spa", locationCity: "Pasadena", locationState: "CA", skills: ["Sleep Science", "Client Relations", "Mindfulness"], yearsExperience: 5, seniority: "MID", source: "JOB_BOARD", rating: 4, stage: Stage.SCREEN, summary: "Renowned sleep and wellness specialist with a calm, graceful client manner." },
  { firstName: "Ariel", lastName: "Triton", currentTitle: "Marine Biologist", currentCompany: "Atlantica Aquarium", locationCity: "San Diego", locationState: "CA", skills: ["Marine Research", "Public Speaking", "Collections Curation"], yearsExperience: 4, seniority: "MID", source: "CAREER_SITE", rating: 4, stage: Stage.INTERVIEW, summary: "Curious researcher with an unmatched collection of artifacts and a strong voice for ocean advocacy." },
  { firstName: "Belle", lastName: "Beaumont", currentTitle: "Head Librarian", currentCompany: "Provincial Library System", locationCity: "Glendale", locationState: "CA", skills: ["Research", "French", "Literature", "Cataloging"], yearsExperience: 7, seniority: "SENIOR", source: "REFERRAL", rating: 5, stage: Stage.OFFER, summary: "Voracious reader and gifted researcher; sees potential where others see beasts." },
  { firstName: "Jasmine", lastName: "Sultana", currentTitle: "Diplomatic Relations Lead", currentCompany: "Agrabah Trade Council", locationCity: "Los Angeles", locationState: "CA", skills: ["Negotiation", "Public Policy", "Leadership"], yearsExperience: 6, seniority: "LEAD", source: "OUTBOUND", rating: 5, stage: Stage.INTERVIEW, summary: "Fierce negotiator who refuses to be a prize to be won; pushes for fair trade deals." },
  { firstName: "Pocahontas", lastName: "Powhatan", currentTitle: "Environmental Consultant", currentCompany: "Riverbend Conservation", locationCity: "Sacramento", locationState: "CA", skills: ["Environmental Policy", "Mediation", "Navigation"], yearsExperience: 7, seniority: "SENIOR", source: "EVENT", rating: 4, stage: Stage.SCREEN, summary: "Bridges cultures and resolves conflict; paints with all the colors of the wind." },
  { firstName: "Mulan", lastName: "Fa", currentTitle: "Defense Strategy Analyst", currentCompany: "Imperial Consulting Group", locationCity: "San Francisco", locationState: "CA", skills: ["Strategy", "Martial Arts", "Crisis Management"], yearsExperience: 5, seniority: "SENIOR", source: "AGENCY", rating: 5, stage: Stage.HIRED, summary: "Decorated strategist who saved an entire organization through unconventional thinking." },
  { firstName: "Tiana", lastName: "Rogers", currentTitle: "Restaurant Owner", currentCompany: "Tiana's Palace", locationCity: "New Orleans", locationState: "LA", skills: ["Culinary Arts", "Business Operations", "P&L Management"], yearsExperience: 9, seniority: "DIRECTOR", source: "INBOUND", rating: 5, stage: Stage.OFFER, summary: "Self-made entrepreneur who built a restaurant empire from sheer hard work." },
  { firstName: "Rapunzel", lastName: "Corona", currentTitle: "Visual Artist", currentCompany: "Tower Studios", locationCity: "Santa Barbara", locationState: "CA", skills: ["Painting", "Astronomy", "Creative Direction"], yearsExperience: 3, seniority: "JUNIOR", source: "LINKEDIN", rating: 4, stage: Stage.APPLIED, summary: "Prolific painter with 18 years of focused studio time and a knack for problem-solving with limited resources." },
  { firstName: "Merida", lastName: "DunBroch", currentTitle: "Outdoor Programs Director", currentCompany: "Highland Adventures", locationCity: "Denver", locationState: "CO", skills: ["Archery", "Outdoor Education", "Program Management"], yearsExperience: 6, seniority: "DIRECTOR", source: "REFERRAL", rating: 4, stage: Stage.SCREEN, summary: "Award-winning archer who changed her own fate; leads with fierce independence." },
  { firstName: "Moana", lastName: "Waialiki", currentTitle: "Logistics & Voyaging Lead", currentCompany: "Motunui Shipping Co.", locationCity: "Honolulu", locationState: "HI", skills: ["Navigation", "Logistics", "Team Leadership"], yearsExperience: 4, seniority: "LEAD", source: "CAREER_SITE", rating: 5, stage: Stage.INTERVIEW, summary: "Master wayfinder who restored an entire supply chain; the ocean chose her." },
  { firstName: "Raya", lastName: "Kumandra", currentTitle: "Security Specialist", currentCompany: "Heart Land Security", locationCity: "Seattle", locationState: "WA", skills: ["Security Operations", "Swordsmanship", "Trust Building"], yearsExperience: 5, seniority: "SENIOR", source: "OUTBOUND", rating: 4, stage: Stage.APPLIED, summary: "Guardian of critical assets; rebuilt cross-team trust after a major organizational split." },
  { firstName: "Elsa", lastName: "Arendelle", currentTitle: "Chief Executive Officer", currentCompany: "Arendelle Industries", locationCity: "Minneapolis", locationState: "MN", skills: ["Executive Leadership", "Change Management", "Cryogenics"], yearsExperience: 10, seniority: "C_LEVEL", source: "RECRUITER_NETWORK", rating: 5, stage: Stage.INTERVIEW, summary: "Former monarch turned executive; let go of a kingdom to build something greater." },
  { firstName: "Anna", lastName: "Arendelle", currentTitle: "Chief Operating Officer", currentCompany: "Arendelle Industries", locationCity: "Minneapolis", locationState: "MN", skills: ["Operations", "Relationship Building", "Resilience"], yearsExperience: 7, seniority: "C_LEVEL", source: "REFERRAL", rating: 5, stage: Stage.SCREEN, summary: "Relentlessly optimistic operator who does the next right thing, every time." },
  { firstName: "Megara", lastName: "Thebes", currentTitle: "Contract Negotiator", currentCompany: "Olympus Legal Partners", locationCity: "Las Vegas", locationState: "NV", skills: ["Contract Law", "Negotiation", "Sarcasm"], yearsExperience: 8, seniority: "SENIOR", source: "AGENCY", rating: 3, stage: Stage.APPLIED, summary: "Sharp-tongued dealmaker with experience untangling extremely unfavorable contracts." },
  { firstName: "Esmeralda", lastName: "LaCour", currentTitle: "Community Outreach Manager", currentCompany: "Notre Dame Foundation", locationCity: "Sacramento", locationState: "CA", skills: ["Community Organizing", "Advocacy", "Dance"], yearsExperience: 6, seniority: "MANAGER", source: "EVENT", rating: 4, stage: Stage.SCREEN, summary: "Passionate advocate for the marginalized; rallies communities like no one else." },
  { firstName: "Kida", lastName: "Nedakh", currentTitle: "Cultural Heritage Director", currentCompany: "Atlantis Institute", locationCity: "San Jose", locationState: "CA", skills: ["Linguistics", "Archaeology", "Leadership"], yearsExperience: 9, seniority: "DIRECTOR", source: "LINKEDIN", rating: 4, stage: Stage.APPLIED, summary: "Preserves and revitalizes lost knowledge; fluent in several dead languages." },
  { firstName: "Giselle", lastName: "Andalasia", currentTitle: "Fashion Designer", currentCompany: "Andalasia Apparel", locationCity: "New York", locationState: "NY", skills: ["Fashion Design", "Singing", "Optimism"], yearsExperience: 4, seniority: "MID", source: "INBOUND", rating: 4, stage: Stage.APPLIED, summary: "Turns curtains into couture; brings enchanted-level positivity to every team." },
  { firstName: "Vanellope", lastName: "von Schweetz", currentTitle: "Game Developer", currentCompany: "Sugar Rush Studios", locationCity: "San Francisco", locationState: "CA", skills: ["Game Development", "Kart Racing", "Glitch Exploitation"], yearsExperience: 3, seniority: "JUNIOR", source: "JOB_BOARD", rating: 4, stage: Stage.SCREEN, summary: "Turned a known glitch into her signature feature; president of her own game world." },
];

async function main() {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    console.error(`Organization ${orgId} not found.`);
    process.exit(1);
  }
  console.log(`Seeding org: ${org.name}`);

  const owner = org.ownerUserId
    ? await prisma.user.findUnique({ where: { id: org.ownerUserId } })
    : null;

  // Client: Walt Disney
  let client = await prisma.client.findFirst({
    where: { organizationId: orgId, name: "Walt Disney" },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: "Walt Disney",
        organizationId: orgId,
        status: ClientStatus.ACTIVE,
        industry: "Entertainment & Media",
        location: "Burbank, CA",
        website: "https://www.disney.com",
        address: "500 South Buena Vista Street, Burbank, CA 91521",
        phone: "(818) 560-1000",
        companySize: CompanySize.ONE_THOUSAND_PLUS,
        revenueBand: RevenueBand.OVER_1B,
        ownerId: owner?.id,
        notes: "Flagship entertainment client. High-volume seasonal hiring for character performers.",
      },
    });
    console.log(`Created client: ${client.name} (${client.id})`);
  } else {
    console.log(`Client already exists: ${client.name} (${client.id})`);
  }

  // Job: Masis Princesses
  let job = await prisma.job.findFirst({
    where: { organizationId: orgId, title: "Masis Princesses", clientId: client.id },
  });
  if (!job) {
    job = await prisma.job.create({
      data: {
        title: "Masis Princesses",
        organizationId: orgId,
        clientId: client.id,
        status: JobStatus.OPEN,
        department: "Entertainment",
        location: "Burbank, CA",
        jobType: "Full-time",
        salaryLow: 65000,
        salaryHigh: 95000,
        placementFeePercent: 20,
        hiringProcess: "Application review → Recruiter screen → On-site audition → Royal panel interview → Offer",
        description:
          "Walt Disney is seeking enchanting, guest-focused princesses to join the Masis Princesses program. " +
          "Responsibilities include royal meet-and-greets, parade appearances, musical performances, and " +
          "occasionally breaking a curse or two. Must be comfortable with talking animal sidekicks, " +
          "ballgowns, and high volumes of autograph requests. Prior kingdom-management experience a plus.",
        createdById: owner?.id,
      },
    });
    console.log(`Created job: ${job.title} (${job.id})`);
  } else {
    console.log(`Job already exists: ${job.title} (${job.id})`);
  }

  // Candidates + applications
  let created = 0;
  let skipped = 0;
  for (let i = 0; i < PRINCESSES.length; i++) {
    const p = PRINCESSES[i];
    const email = `${p.firstName}.${p.lastName}`
      .toLowerCase()
      .replace(/[^a-z.]/g, "") + "@disneymail.example.com";

    let candidate = await prisma.candidate.findUnique({
      where: { organizationId_email: { organizationId: orgId, email } },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          organizationId: orgId,
          firstName: p.firstName,
          lastName: p.lastName,
          email,
          phone: `(818) 555-${String(1000 + i).padStart(4, "0")}`,
          status: CandidateStatus.ACTIVE,
          currentTitle: p.currentTitle,
          currentCompany: p.currentCompany,
          yearsExperience: p.yearsExperience,
          seniority: p.seniority,
          source: p.source,
          locationCity: p.locationCity,
          locationState: p.locationState,
          locationCountry: "USA",
          summary: p.summary,
          skills: p.skills,
          desiredSalaryMin: 60000 + i * 2000,
          desiredSalaryMax: 80000 + i * 2500,
          salaryCurrency: "USD",
          rating: p.rating,
          linkedinUrl: `https://www.linkedin.com/in/${p.firstName.toLowerCase()}-${p.lastName.toLowerCase().replace(/[^a-z]/g, "")}`,
          sourcedById: owner?.id,
        },
      });
      created++;
    } else {
      skipped++;
    }

    await prisma.application.upsert({
      where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
      update: {},
      create: {
        organizationId: orgId,
        jobId: job.id,
        candidateId: candidate.id,
        stage: p.stage,
        rating: p.rating,
      },
    });
  }

  console.log(`Candidates: ${created} created, ${skipped} already existed.`);
  console.log(`All ${PRINCESSES.length} candidates linked to "${job.title}".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
