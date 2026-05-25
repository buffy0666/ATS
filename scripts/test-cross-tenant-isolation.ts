/**
 * Cross-tenant isolation smoke test.
 *
 * Creates two ephemeral test orgs (Org A and Org B) directly via Prisma,
 * seeds each with overlapping "would-collide" data, then asserts that
 * every helper, action, AI tool, and HTTP route refuses to leak Org B's
 * rows to a session signed in as Org A.
 *
 * Read-only against existing org data — only the two ephemeral test orgs
 * are created and destroyed. Both are cleaned up in `finally` so a
 * mid-test crash doesn't litter the DB; if it ever does, all rows are
 * prefixed with `test-iso-` so a human can grep + delete.
 *
 * Usage:
 *   npm run smoke-test
 *   # or
 *   npx tsx --env-file=.env scripts/test-cross-tenant-isolation.ts
 *
 * Exit code is 0 only if every check passes.
 */

import { config as loadEnv } from "dotenv";
loadEnv();

import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  CustomFieldEntity,
  CustomFieldType,
  JobStatus,
  ListScope,
  PrismaClient,
  Role,
  Stage,
  TaskStatus,
} from "../src/generated/prisma";
import { searchCandidates } from "../src/lib/candidate-search";
import { getCandidateTool } from "../src/lib/ai/tools/get-candidate";
import { getJobTool } from "../src/lib/ai/tools/get-job";
import { listJobsTool } from "../src/lib/ai/tools/list-jobs";
import { listClientsTool } from "../src/lib/ai/tools/list-clients";
import { listListsTool } from "../src/lib/ai/tools/list-lists";
import { addToListTool } from "../src/lib/ai/tools/add-to-list";
import { tagCandidatesTool } from "../src/lib/ai/tools/tag-candidates";
import { emailCandidateTool } from "../src/lib/ai/tools/email-candidate";
import { moveApplicationStageTool } from "../src/lib/ai/tools/move-application-stage";
import type { ToolContext } from "../src/lib/ai/tools/types";

// ---------- result tracking ----------

type CheckResult = {
  name: string;
  passed: boolean;
  detail?: string;
};
const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  const symbol = passed ? "✓" : "✗";
  const detailStr = detail ? ` — ${detail}` : "";
  console.log(`${symbol} ${name}${detailStr}`);
}

function info(message: string): void {
  console.log(`  · ${message}`);
}

// ---------- seed types ----------

type SeededOrg = {
  org: { id: string; slug: string; name: string };
  user: { id: string; email: string };
  apiToken: string;
  candidate: { id: string; email: string; linkedinUrl: string };
  tag: { id: string; name: string };
  choiceOption: { id: string; name: string };
  customField: { id: string; key: string };
  job: { id: string; title: string };
  client: { id: string; name: string };
  task: { id: string; name: string };
  list: { id: string; name: string };
  application: { id: string };
};

type Seeded = { orgA: SeededOrg; orgB: SeededOrg };

const PREFIX = "test-iso-";
const SHARED_EMAIL = "shared-iso@test.local";

const prisma = new PrismaClient();

// ---------- seeding ----------

async function createApiTokenRow(
  userId: string,
  organizationId: string,
): Promise<string> {
  const random = randomBytes(32).toString("hex");
  const token = `ats_${random}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const tokenPrefix = token.slice(0, 12);
  await prisma.apiToken.create({
    data: {
      userId,
      organizationId,
      name: `${PREFIX}token`,
      tokenHash,
      tokenPrefix,
    },
  });
  return token;
}

/**
 * Try to create a row with a "shared" value (intended to collide across
 * tenants); if a global @unique blocks it, fall back to a unique value
 * and return that. Either way the seed succeeds and the test continues.
 */
async function trySharedOrFallback<T>(
  label: string,
  sharedValue: string,
  attempt: (value: string) => Promise<T>,
  fallback: () => string,
): Promise<{ row: T; usedShared: boolean; valueUsed: string }> {
  try {
    const row = await attempt(sharedValue);
    return { row, usedShared: true, valueUsed: sharedValue };
  } catch (error) {
    const fb = fallback();
    info(`${label}: shared value blocked → falling back to "${fb}" (${error instanceof Error ? error.message.split("\n")[0] : "unknown"})`);
    const row = await attempt(fb);
    return { row, usedShared: false, valueUsed: fb };
  }
}

async function seedOrg(label: "A" | "B"): Promise<SeededOrg> {
  const uuid = randomUUID().slice(0, 8);
  const slug = `${PREFIX}${label.toLowerCase()}-${uuid}`;
  const orgName = `${PREFIX}org-${label}-${uuid}`;
  const userEmail = `${PREFIX}admin-${label.toLowerCase()}-${uuid}@test.local`;
  const linkedinUrl = `https://linkedin.com/in/${PREFIX}${label.toLowerCase()}-${uuid}`;

  // 1. Org + admin user
  const passwordHash = await bcrypt.hash("isolation-test-password", 10);
  const user = await prisma.user.create({
    data: {
      email: userEmail,
      name: `Iso Admin ${label}`,
      role: Role.ADMIN,
      passwordHash,
    },
    select: { id: true, email: true },
  });
  const org = await prisma.organization.create({
    data: { slug, name: orgName, ownerUserId: user.id },
    select: { id: true, slug: true, name: true },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { organizationId: org.id },
  });

  // 2. API token for the external API test
  const apiToken = await createApiTokenRow(user.id, org.id);

  // 3. Candidate — same email across orgs is the textbook "would-collide" case.
  const candidateRes = await trySharedOrFallback(
    `[${label}] Candidate.email`,
    SHARED_EMAIL,
    async (email) => {
      return prisma.candidate.create({
        data: {
          email,
          firstName: `Iso${label}`,
          lastName: `Candidate-${uuid}`,
          linkedinUrl,
          organizationId: org.id,
        },
        select: { id: true, email: true, linkedinUrl: true },
      });
    },
    () => `${PREFIX}cand-${label.toLowerCase()}-${uuid}@test.local`,
  );
  const candidate = {
    id: candidateRes.row.id,
    email: candidateRes.row.email,
    linkedinUrl: candidateRes.row.linkedinUrl ?? linkedinUrl,
  };

  // 4. Tag — same name across orgs
  const tagRes = await trySharedOrFallback(
    `[${label}] Tag.name`,
    "DevOps",
    async (name) => {
      return prisma.tag.create({
        data: { name, color: "indigo", organizationId: org.id },
        select: { id: true, name: true },
      });
    },
    () => `DevOps-${label}-${uuid}`,
  );

  // 5. ChoiceOption — same (field, name) across orgs
  const choiceRes = await trySharedOrFallback(
    `[${label}] ChoiceOption(candidate.source, name)`,
    "LinkedIn",
    async (name) => {
      return prisma.choiceOption.create({
        data: {
          field: "candidate.source",
          name,
          organizationId: org.id,
        },
        select: { id: true, name: true },
      });
    },
    () => `LinkedIn-${label}-${uuid}`,
  );

  // 6. CustomField — same (entity, key) across orgs
  const customFieldRes = await trySharedOrFallback(
    `[${label}] CustomField(CANDIDATE, key)`,
    "iso_test_field",
    async (key) => {
      return prisma.customField.create({
        data: {
          entity: CustomFieldEntity.CANDIDATE,
          key,
          label: "Iso Test Field",
          type: CustomFieldType.TEXT,
          organizationId: org.id,
        },
        select: { id: true, key: true },
      });
    },
    () => `iso_test_field_${label.toLowerCase()}_${uuid}`,
  );

  // 7. Client
  const client = await prisma.client.create({
    data: {
      name: `${PREFIX}Client-${label}-${uuid}`,
      organizationId: org.id,
      ownerId: user.id,
    },
    select: { id: true, name: true },
  });

  // 8. Job (created against the client)
  const job = await prisma.job.create({
    data: {
      title: `${PREFIX}Job-${label}-${uuid}`,
      description: `Test job for org ${label}.`,
      status: JobStatus.OPEN,
      organizationId: org.id,
      clientId: client.id,
      createdById: user.id,
    },
    select: { id: true, title: true },
  });

  // 9. Application (links the candidate to the job, same org)
  const application = await prisma.application.create({
    data: {
      jobId: job.id,
      candidateId: candidate.id,
      stage: Stage.APPLIED,
      organizationId: org.id,
    },
    select: { id: true },
  });

  // 10. Task
  const task = await prisma.task.create({
    data: {
      name: `${PREFIX}Task-${label}-${uuid}`,
      status: TaskStatus.NOT_STARTED,
      organizationId: org.id,
      createdById: user.id,
    },
    select: { id: true, name: true },
  });

  // 11. CandidateList — used to test add-to-list cross-tenant block
  const list = await prisma.candidateList.create({
    data: {
      name: `${PREFIX}List-${label}-${uuid}`,
      scope: ListScope.PERSONAL,
      ownerId: user.id,
      organizationId: org.id,
    },
    select: { id: true, name: true },
  });

  return {
    org,
    user,
    apiToken,
    candidate,
    tag: tagRes.row,
    choiceOption: choiceRes.row,
    customField: customFieldRes.row,
    job,
    client,
    task,
    list,
    application,
  };
}

async function seedOrgs(): Promise<Seeded> {
  console.log("=== seeding two ephemeral orgs ===");
  const orgA = await seedOrg("A");
  info(`Org A: ${orgA.org.slug} (id=${orgA.org.id})`);
  const orgB = await seedOrg("B");
  info(`Org B: ${orgB.org.slug} (id=${orgB.org.id})`);
  console.log("");
  return { orgA, orgB };
}

// ---------- cleanup ----------

async function cleanupOrg(s: SeededOrg): Promise<void> {
  // Delete in order that respects FKs without depending on cascade rules:
  //   children → org-owned rows → org → user
  // We don't trust cascade because Phase 6's lockdown plan adds new
  // relations and we want this script to be safe across schema drift.
  try {
    await prisma.candidateListMember.deleteMany({ where: { listId: s.list.id } });
    await prisma.application.deleteMany({ where: { id: s.application.id } });
  } catch {}
  try {
    await prisma.task.deleteMany({ where: { id: s.task.id } });
    await prisma.candidateList.deleteMany({ where: { id: s.list.id } });
    await prisma.customField.deleteMany({ where: { id: s.customField.id } });
    await prisma.choiceOption.deleteMany({ where: { id: s.choiceOption.id } });
    await prisma.candidate.deleteMany({ where: { id: s.candidate.id } });
    await prisma.job.deleteMany({ where: { id: s.job.id } });
    await prisma.client.deleteMany({ where: { id: s.client.id } });
    await prisma.tag.deleteMany({ where: { id: s.tag.id } });
    await prisma.apiToken.deleteMany({ where: { organizationId: s.org.id } });
  } catch (error) {
    console.warn(`cleanup partial failure for org ${s.org.slug}:`, error);
  }
  // Some orgs still hold lingering rows we didn't track here (e.g. Notes /
  // EmailLogs created accidentally). Wipe by org first as a safety net.
  await prisma.application.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.candidate.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.client.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.job.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.tag.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.choiceOption.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.customField.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.task.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.candidateList.deleteMany({ where: { organizationId: s.org.id } });
  await prisma.apiToken.deleteMany({ where: { organizationId: s.org.id } });

  // Detach the user from the org first so the org delete doesn't trip a
  // not-null FK constraint that future schema changes might add.
  await prisma.user.updateMany({
    where: { id: s.user.id },
    data: { organizationId: null },
  });
  await prisma.organization.deleteMany({ where: { id: s.org.id } });
  await prisma.user.deleteMany({ where: { id: s.user.id } });
}

async function cleanup(seeded: Seeded | null): Promise<void> {
  if (!seeded) return;
  console.log("\n=== cleanup ===");
  await cleanupOrg(seeded.orgA);
  await cleanupOrg(seeded.orgB);
  info("done");
}

// ---------- tests ----------

function makeCtx(s: SeededOrg, conversationId = "test-iso-conv"): ToolContext {
  return {
    userId: s.user.id,
    role: Role.ADMIN,
    conversationId,
    organizationId: s.org.id,
  };
}

async function runTests(seeded: Seeded): Promise<void> {
  const { orgA, orgB } = seeded;
  console.log("=== isolation checks ===");

  // ---- Direct Prisma reads (the foundation other code is built on) ----

  const tagsA = await prisma.tag.findMany({
    where: { organizationId: orgA.org.id },
    select: { id: true },
  });
  check(
    "Tag.findMany scoped to Org A returns A's tag only",
    tagsA.length === 1 && tagsA[0].id === orgA.tag.id,
    `count=${tagsA.length}`,
  );

  const candA = await prisma.candidate.findFirst({
    where: { id: orgB.candidate.id, organizationId: orgA.org.id },
  });
  check(
    "Candidate.findFirst with B's id under Org A returns null",
    candA === null,
    candA ? `LEAK: got candidate ${candA.id}` : undefined,
  );

  const candidatesA = await prisma.candidate.findMany({
    where: { organizationId: orgA.org.id },
    select: { id: true },
  });
  check(
    "Candidate.findMany scoped to Org A doesn't include B's candidate",
    !candidatesA.some((c) => c.id === orgB.candidate.id),
    `count=${candidatesA.length}`,
  );

  const choicesA = await prisma.choiceOption.findMany({
    where: { organizationId: orgA.org.id },
    select: { id: true },
  });
  check(
    "ChoiceOption.findMany scoped to Org A excludes B's options",
    !choicesA.some((c) => c.id === orgB.choiceOption.id),
    `count=${choicesA.length}`,
  );

  const customA = await prisma.customField.findMany({
    where: { organizationId: orgA.org.id },
    select: { id: true },
  });
  check(
    "CustomField.findMany scoped to Org A excludes B's fields",
    !customA.some((f) => f.id === orgB.customField.id),
    `count=${customA.length}`,
  );

  const jobA = await prisma.job.findFirst({
    where: { id: orgB.job.id, organizationId: orgA.org.id },
  });
  check("Job.findFirst with B's id under Org A returns null", jobA === null);

  const clientA = await prisma.client.findFirst({
    where: { id: orgB.client.id, organizationId: orgA.org.id },
  });
  check("Client.findFirst with B's id under Org A returns null", clientA === null);

  const taskA = await prisma.task.findFirst({
    where: { id: orgB.task.id, organizationId: orgA.org.id },
  });
  check("Task.findFirst with B's id under Org A returns null", taskA === null);

  const listA = await prisma.candidateList.findFirst({
    where: { id: orgB.list.id, organizationId: orgA.org.id },
  });
  check(
    "CandidateList.findFirst with B's id under Org A returns null",
    listA === null,
  );

  // ---- Tag.upsert: the dangerous one (global @unique on name pre-Phase 6) ----

  // If both orgs have a tag with the same name (the shared-seed path
  // succeeded), an upsert under Org A *might* return Org B's tag id —
  // which would be a bug.
  if (orgA.tag.name === orgB.tag.name) {
    const upserted = await prisma.tag.upsert({
      where: { name: orgA.tag.name },
      create: { name: orgA.tag.name, color: "indigo", organizationId: orgA.org.id },
      update: {},
      select: { id: true, organizationId: true },
    });
    check(
      "Tag.upsert by name resolves within the calling org's tag",
      upserted.id === orgA.tag.id,
      upserted.id === orgB.tag.id
        ? `LEAK: upsert returned Org B's tag id ${orgB.tag.id} when called by Org A`
        : `resolved to ${upserted.organizationId === orgA.org.id ? "A" : upserted.organizationId === orgB.org.id ? "B" : "neither"}`,
    );
  } else {
    info(
      `Tag name collision didn't actually occur (A="${orgA.tag.name}", B="${orgB.tag.name}"); upsert leak test skipped`,
    );
  }

  // ---- candidate-search ----

  // Seed a distinctive token in B's candidate's summary that A shouldn't surface.
  const probeToken = `isoprobe${randomUUID().slice(0, 6)}`;
  await prisma.candidate.update({
    where: { id: orgB.candidate.id },
    data: { summary: `Internal note containing ${probeToken}` },
  });
  // Trigger a no-op write so the searchVector picks up the new summary.
  // (The schema's searchVector is a STORED generated column over scalar
  // text fields, so the update above already refreshes it.)
  const ftsIds = await searchCandidates(probeToken, orgA.org.id);
  check(
    "searchCandidates(probeToken, orgA) does not surface B's candidate",
    ftsIds === null || !ftsIds.includes(orgB.candidate.id),
    `ids=${JSON.stringify(ftsIds)}`,
  );

  const ftsB = await searchCandidates(probeToken, orgB.org.id);
  check(
    "searchCandidates(probeToken, orgB) DOES surface B's candidate (sanity)",
    Array.isArray(ftsB) && ftsB.includes(orgB.candidate.id),
    `ids=${JSON.stringify(ftsB)}`,
  );

  // ---- AI tools ----

  const ctxA = makeCtx(orgA);

  const getCandRes = await getCandidateTool.execute(
    { candidateId: orgB.candidate.id },
    ctxA,
  );
  check(
    "AI tool get_candidate with B's id under Org A returns not-found",
    isNotFound(getCandRes, "candidate"),
    summarise(getCandRes),
  );

  const getJobRes = await getJobTool.execute({ jobId: orgB.job.id }, ctxA);
  check(
    "AI tool get_job with B's id under Org A returns not-found",
    isNotFound(getJobRes, "job"),
    summarise(getJobRes),
  );

  const listJobsRes = (await listJobsTool.execute({ limit: 50 }, ctxA)) as {
    results: { id: string }[];
  };
  check(
    "AI tool list_jobs under Org A omits B's job",
    !listJobsRes.results.some((j) => j.id === orgB.job.id),
    `count=${listJobsRes.results.length}`,
  );

  const listClientsRes = (await listClientsTool.execute(
    { limit: 50 },
    ctxA,
  )) as { results: { id: string }[] };
  check(
    "AI tool list_clients under Org A omits B's client",
    !listClientsRes.results.some((c) => c.id === orgB.client.id),
    `count=${listClientsRes.results.length}`,
  );

  const listListsRes = (await listListsTool.execute({ limit: 50 }, ctxA)) as {
    results: { id: string }[];
  };
  check(
    "AI tool list_lists under Org A omits B's list",
    !listListsRes.results.some((l) => l.id === orgB.list.id),
    `count=${listListsRes.results.length}`,
  );

  // add_to_list: A's list, B's candidate id — should NOT add the candidate.
  const beforeCount = await prisma.candidateListMember.count({
    where: { listId: orgA.list.id },
  });
  const addRes = (await addToListTool.execute(
    { listId: orgA.list.id, candidateIds: [orgB.candidate.id] },
    ctxA,
  )) as { ok?: boolean; addedCount?: number };
  const afterCount = await prisma.candidateListMember.count({
    where: { listId: orgA.list.id },
  });
  check(
    "AI tool add_to_list refuses B's candidate into A's list",
    afterCount === beforeCount && (addRes.addedCount ?? 0) === 0,
    `added=${addRes.addedCount ?? "?"} beforeCount=${beforeCount} afterCount=${afterCount}`,
  );

  // add_to_list with B's listId from A: must error
  const addToBList = (await addToListTool.execute(
    { listId: orgB.list.id, candidateIds: [orgA.candidate.id] },
    ctxA,
  )) as { ok?: boolean; error?: string };
  check(
    "AI tool add_to_list refuses B's list id when called by Org A",
    addToBList.ok === false || typeof addToBList.error === "string",
    summarise(addToBList),
  );

  // tag_candidates: B's candidate from A should fail.
  const tagCandRes = (await tagCandidatesTool.execute(
    { candidateIds: [orgB.candidate.id], tagNames: ["iso-cross-tag"] },
    ctxA,
  )) as { ok?: boolean; error?: string; taggedCount?: number };
  check(
    "AI tool tag_candidates refuses to tag B's candidate from Org A",
    tagCandRes.ok === false || (tagCandRes.taggedCount ?? 0) === 0,
    summarise(tagCandRes),
  );
  // Confirm B's candidate didn't actually get the tag.
  const bCandTags = await prisma.candidate.findUnique({
    where: { id: orgB.candidate.id },
    select: { tags: { select: { name: true } } },
  });
  check(
    "B's candidate did NOT receive the tag attempted via Org A",
    !bCandTags?.tags.some((t) => t.name === "iso-cross-tag"),
    `tags=${bCandTags?.tags.map((t) => t.name).join(",") ?? "(none)"}`,
  );

  // email_candidate: should return not-found before attempting to send.
  const emailRes = (await emailCandidateTool.execute(
    {
      candidateId: orgB.candidate.id,
      subject: "Should never send",
      body: "If this email goes out, isolation is broken.",
    },
    ctxA,
  )) as { ok?: boolean; error?: string };
  check(
    "AI tool email_candidate refuses to email B's candidate from Org A",
    emailRes.ok === false && typeof emailRes.error === "string",
    summarise(emailRes),
  );

  // move_application_stage: B's application from A — must not move.
  const beforeStage = await prisma.application.findUnique({
    where: { id: orgB.application.id },
    select: { stage: true },
  });
  const moveRes = (await moveApplicationStageTool.execute(
    { applicationId: orgB.application.id, stage: Stage.HIRED },
    ctxA,
  )) as { ok?: boolean; error?: string };
  const afterStage = await prisma.application.findUnique({
    where: { id: orgB.application.id },
    select: { stage: true },
  });
  check(
    "AI tool move_application_stage refuses B's application from Org A",
    moveRes.ok === false,
    summarise(moveRes),
  );
  check(
    "B's application stage unchanged after cross-tenant move attempt",
    beforeStage?.stage === afterStage?.stage,
    `before=${beforeStage?.stage} after=${afterStage?.stage}`,
  );

  // ---- External API: POST /api/external/candidates ----

  await runExternalApiCheck(seeded);

  console.log("");
}

function isNotFound(result: unknown, kind: "candidate" | "job"): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as { ok?: boolean; error?: string };
  if (r.ok !== false) return false;
  if (typeof r.error !== "string") return false;
  return r.error.toLowerCase().includes(kind);
}

function summarise(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > 140 ? `${json.slice(0, 140)}…` : json;
  } catch {
    return String(value);
  }
}

async function runExternalApiCheck(seeded: Seeded): Promise<void> {
  const baseUrl = process.env.APP_URL || "http://localhost:3000";
  const url = `${baseUrl.replace(/\/+$/, "")}/api/external/candidates`;

  // The whole point: B already has `${seeded.orgB.candidate.linkedinUrl}`.
  // Posting the same linkedinUrl from Org A's token must succeed (proves
  // there's no false cross-tenant collision) and create the new row under A.
  const payload = {
    firstName: "Iso",
    lastName: `External-${randomUUID().slice(0, 6)}`,
    email: `${PREFIX}ext-${randomUUID().slice(0, 6)}@test.local`,
    linkedinUrl: seeded.orgB.candidate.linkedinUrl,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${seeded.orgA.apiToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    check(
      "External API /api/external/candidates: same linkedinUrl across orgs is allowed",
      false,
      `fetch failed (is the dev server running on ${baseUrl}?) — ${error instanceof Error ? error.message : "unknown"}`,
    );
    return;
  }

  const bodyText = await response.text();
  let parsed: unknown = bodyText;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    // Leave as text.
  }

  if (response.status !== 201) {
    check(
      "External API /api/external/candidates: same linkedinUrl across orgs is allowed",
      false,
      `expected 201, got ${response.status}: ${summarise(parsed)}`,
    );
    return;
  }

  const candidateId = (parsed as { candidate?: { id?: string } })?.candidate?.id;
  if (!candidateId) {
    check(
      "External API /api/external/candidates: same linkedinUrl across orgs is allowed",
      false,
      `201 but no candidate.id in response: ${summarise(parsed)}`,
    );
    return;
  }

  const row = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, organizationId: true, linkedinUrl: true },
  });
  check(
    "External API /api/external/candidates: same linkedinUrl across orgs is allowed",
    row?.organizationId === seeded.orgA.org.id,
    `candidate ${candidateId} → org ${row?.organizationId === seeded.orgA.org.id ? "A" : row?.organizationId === seeded.orgB.org.id ? "B (LEAK)" : "neither"}`,
  );

  // Best-effort cleanup of the row we just created (it won't be caught by
  // the org-scoped cleanup because no application links it).
  await prisma.candidate.deleteMany({ where: { id: candidateId } });
}

// ---------- main ----------

async function main(): Promise<void> {
  let seeded: Seeded | null = null;
  let failed = 0;
  try {
    seeded = await seedOrgs();
    await runTests(seeded);
  } catch (error) {
    console.error("\n!! test run aborted by an unexpected error:");
    console.error(error);
    failed = 1;
  } finally {
    try {
      await cleanup(seeded);
    } catch (error) {
      console.error("cleanup error:", error);
    }
    await prisma.$disconnect();
  }

  const total = results.length;
  const failures = results.filter((r) => !r.passed).length;
  console.log("");
  console.log(`${total - failures} of ${total} checks passed.`);
  if (failures > 0) {
    console.log("");
    console.log("Failed checks:");
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  process.exit(failures > 0 || failed > 0 ? 1 : 0);
}

main();
