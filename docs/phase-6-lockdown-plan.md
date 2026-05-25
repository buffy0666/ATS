# Phase 6 — Schema Lockdown Plan

> Audit produced read-only from the tree at commit `c2d8dfd`. No code or schema
> changes were made by the audit itself. This document is the runbook the next
> agent should execute.

Phases 1–3 are merged: every tenant-owned model has a **nullable**
`organizationId String?` and code filters by it everywhere. Phase 6 is the
**lockdown**:

1. Backfill any remaining NULL `organizationId` rows.
2. Update the small set of code sites that still use globally-unique lookup
   keys.
3. Flip every `organizationId` to `NOT NULL` and replace global `@unique`
   constraints with per-org compound ones.
4. Smoke-test cross-tenant isolation.

---

## 1. `organizationId NOT NULL` audit

The schema declares 20 top-level tenant-scoped models. Each carries
`organizationId String?` today. **All 20 columns** must flip to `NOT NULL` in
Phase 6.

| # | Model | Schema line | All `create`/`createMany` sites set `organizationId`? |
|---|---|---|---|
| 1 | `Tag` | 323 | ✅ — `src/app/settings/tags/actions.ts:30`, `src/app/candidates/actions.ts:420` (via upsert `create`), `src/app/candidates/bulk-actions.ts:171` (upsert `create`), `src/app/candidates/import/actions.ts:160` (upsert `create`), `src/app/clients/actions.ts:75` (upsert `create`), `src/lib/ai/tools/tag-candidates.ts:40` (upsert `create`) |
| 2 | `ApiToken` | 408 | ✅ — `src/lib/api-tokens.ts:24` |
| 3 | `AIConfig` | 434 (also `@unique`) | ✅ — only created via `prisma.aIConfig.upsert` paths in admin settings; the org-unique constraint stays after lockdown |
| 4 | `Job` | 461 | ✅ — `src/app/jobs/actions.ts:58` |
| 5 | `Client` | 492 | ✅ — `src/app/clients/actions.ts:109` |
| 6 | `ClientContact` | 522 | ✅ — `src/app/clients/actions.ts:212` |
| 7 | `Candidate` | 656 | ⚠️ — `src/app/candidates/actions.ts:329` ✅, `src/app/candidates/import/actions.ts:96` ✅, `src/app/api/external/candidates/route.ts:211` ✅, **`src/app/apply/[jobId]/page.tsx:51` ❌ — public apply form omits `organizationId`. Must inherit from `job.organizationId`.** |
| 8 | `Application` | 683 | ⚠️ — `src/app/candidates/bulk-actions.ts:127` ✅, **`src/app/apply/[jobId]/page.tsx:70` ❌ — same root cause; should set from `job.organizationId`.** |
| 9 | `Note` | 708 | ✅ — `src/app/candidates/[id]/notes-actions.ts:56` + `:72`, `src/app/candidates/[id]/review/review-actions.ts:107` |
| 10 | `KnowledgeItem` | 728 | ✅ — `src/app/knowledge/actions.ts:88` |
| 11 | `EmailTemplate` | 747 | ✅ — `src/app/templates/actions.ts:24` |
| 12 | `EmailLog` | 780 | ⚠️ — `src/app/candidates/[id]/email-actions.ts:63` + `:90` ✅, `src/app/interviews/actions.ts:317` ✅ (inferred from sender), `src/app/sequences/actions.ts:589` + `:718` ✅, **`src/app/users/actions.ts:110` + `:125` ❌ — admin-invite emails skip the field**, **`src/lib/ai/tools/email-candidate.ts:70` + `:98` ❌ — assistant tool skips the field; `ctx.organizationId` is available.** |
| 13 | `Task` | 876 | ✅ — `src/app/tasks/actions.ts:81` |
| 14 | `CandidateList` | 917 | ✅ — `src/app/lists/actions.ts:30`, `src/app/candidates/bulk-actions.ts:259`, `src/lib/ai/tools/create-list.ts:29` |
| 15 | `SavedSearch` | 954 | ❌ — **`src/app/candidates/saved-search-actions.ts:29` omits `organizationId`. Must set from `session.user.organizationId`.** |
| 16 | `Interview` | 984 | ✅ — `src/app/interviews/actions.ts:116` |
| 17 | `ChoiceOption` | 1021 | ✅ — `src/app/settings/choices/actions.ts:103`, `src/lib/choices.ts:84` (createMany) |
| 18 | `Sequence` | 1046 | ✅ — `src/app/sequences/actions.ts:95` |
| 19 | `AssistantConversation` | 1152 | ✅ — `src/app/api/assistant/chat/route.ts:59` (sets from session, nullable-safe) |
| 20 | `CustomField` | 1239 | ✅ — `src/app/settings/custom-fields/actions.ts:105` |

### 1a. Create sites that must be fixed before the NOT NULL flip

Seven sites currently insert rows **without** `organizationId`. Each must be
patched first or the `db push` will fail on the existing rows:

1. `src/app/apply/[jobId]/page.tsx:51` — `prisma.candidate.create` (public apply).
   Inherit from the job: `organizationId: job.organizationId`.
2. `src/app/apply/[jobId]/page.tsx:70` — `prisma.application.create`. Same source.
3. `src/app/candidates/saved-search-actions.ts:29` — `prisma.savedSearch.create`.
   Set `organizationId: session.user.organizationId`.
4. `src/app/users/actions.ts:110` — `prisma.emailLog.create` (admin invite SENT).
   Set from the admin user's org (look up alongside `adminUserId`).
5. `src/app/users/actions.ts:125` — `prisma.emailLog.create` (admin invite FAILED).
   Same fix as #4.
6. `src/lib/ai/tools/email-candidate.ts:70` — `prisma.emailLog.create` (success).
   Set `organizationId: ctx.organizationId`.
7. `src/lib/ai/tools/email-candidate.ts:98` — `prisma.emailLog.create` (failure).
   Same fix as #6.

### 1b. SQL to flip each column NOT NULL

Run **after** Section 4 confirms zero NULL rows for the table. Prisma names
the column `"organizationId"` (camelCase). Postgres-native:

```sql
ALTER TABLE "Tag"                   ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ApiToken"              ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AIConfig"              ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Job"                   ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Client"                ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ClientContact"         ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Candidate"             ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Application"           ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Note"                  ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "KnowledgeItem"         ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "EmailTemplate"         ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "EmailLog"              ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Task"                  ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CandidateList"         ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "SavedSearch"           ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Interview"             ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "ChoiceOption"          ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Sequence"              ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "AssistantConversation" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "CustomField"           ALTER COLUMN "organizationId" SET NOT NULL;
```

If the executor edits `prisma/schema.prisma` to drop the `?` and runs
`prisma db push`, Prisma will generate equivalent statements automatically.
Either path is fine — direct SQL is included for shops that don't trust
`db push` on a hot DB.

---

## 2. `@unique` constraints that need to become compound

Audit of every `@unique` / `@@unique` in `prisma/schema.prisma`:

| Line | Constraint | Verdict |
|---|---|---|
| 275 | `Organization.slug @unique` | Stay global. Slugs identify tenants. |
| 285 | `Organization.ownerUserId @unique` | Stay global. One owner per user. |
| 320 | **`Tag.name @unique`** | **Per-org.** Swap to `@@unique([organizationId, name])`. |
| 338 | `User.email @unique` | Stay global. Users authenticate by email across the system. |
| 382 | `User.iCalToken @unique` | Stay global. Calendar feed token. |
| 409 | `ApiToken.tokenHash @unique` | Stay global. Auth-bearer uniqueness. |
| 446 | `AIConfig.organizationId @unique` | Stay (it **is** the per-org constraint). Flips from `String?` to `String`. |
| 544 | **`Candidate.email @unique`** | **Per-org.** Swap to `@@unique([organizationId, email])`. |
| 698 | `Application @@unique([jobId, candidateId])` | Stay. `jobId` is tenant-bound. |
| 844 | `CandidateEEO.candidateId @unique` | Stay. One-to-one with Candidate; tenancy via parent. |
| 948 | `CandidateListMember @@unique([listId, candidateId])` | Stay. `listId` is tenant-bound. |
| 1038 | **`ChoiceOption @@unique([field, name])`** | **Per-org.** Swap to `@@unique([organizationId, field, name])`. |
| 1086 | `SequenceStep @@unique([sequenceId, order])` | Stay. `sequenceId` is tenant-bound. |
| 1107 | `SequenceEnrollment @@unique([sequenceId, candidateId])` | Stay. |
| 1121 | `StepRun.emailLogId String? @unique` | Stay. One EmailLog per StepRun (one-to-one). |
| 1255 | **`CustomField @@unique([entity, key])`** | **Per-org.** Swap to `@@unique([organizationId, entity, key])`. |
| 1274 | `CustomFieldValue @@unique([fieldId, entityId])` | Stay. `fieldId` is tenant-bound. |

> **`Candidate.linkedinUrl`** was called out in the brief but the schema
> doesn't currently have `@unique` on it (line 27 of the Candidate block is
> just `linkedinUrl String?`). No constraint change needed there.
> **`EmailTemplate.name`** is also not `@unique` today. No constraint change.

### 2a. Per-constraint schema patches

```prisma
// Tag (line ~320)
- name      String   @unique
+ name      String
+ @@unique([organizationId, name])

// Candidate (line ~544)
- email         String  @unique
+ email         String
+ @@unique([organizationId, email])

// ChoiceOption (line ~1038)
- @@unique([field, name])
+ @@unique([organizationId, field, name])

// CustomField (line ~1255)
- @@unique([entity, key])
+ @@unique([organizationId, entity, key])
```

### 2b. Generated compound-key names (Prisma convention)

These are what the call-site updates in Section 3 must reference:

| Model | New compound key constant |
|---|---|
| `Tag` | `organizationId_name` |
| `Candidate` | `organizationId_email` |
| `ChoiceOption` | `organizationId_field_name` |
| `CustomField` | `organizationId_entity_key` |

---

## 3. Code patterns that break when the uniques become compound

Every site below currently uses the **global** unique key. After Phase 6 the
key shape changes; each must be edited or the build fails on TS errors.

### 3a. `Tag.name` upserts (5 sites)

All five do the same pattern: `prisma.tag.upsert({ where: { name }, create: { name, color, organizationId }, ... })`. The `where` must become
`{ organizationId_name: { organizationId: orgId, name } }`.

| # | File:line | Current | Notes |
|---|---|---|---|
| 1 | `src/app/candidates/bulk-actions.ts:170` | `where: { name }` | Inline comment already warns about Phase 6. |
| 2 | `src/app/candidates/actions.ts:421` | `where: { name }` | Inside `syncTagNamesToIds`. |
| 3 | `src/app/candidates/import/actions.ts:160` | `where: { name }` | Inside CSV import helper. |
| 4 | `src/app/clients/actions.ts:75` | `where: { name }` | Inside `syncTagNamesToIds` (clients copy). |
| 5 | `src/lib/ai/tools/tag-candidates.ts:40` | `where: { name }` | Inline comment already warns about Phase 6. |

### 3b. `Candidate.email` lookups (1 site)

The public apply path uses the global unique today. Cross-tenant duplicates
will be impossible after Phase 6 only if this is changed:

| # | File:line | Current | Fix |
|---|---|---|---|
| 1 | `src/app/apply/[jobId]/page.tsx:37` | `prisma.candidate.findUnique({ where: { email } })` | Switch to `findFirst({ where: { email, organizationId: job.organizationId } })`. Pair this with the Section 1a fix that makes the subsequent `create` set the org. |

All other Candidate-email lookups already use `findFirst` with an `organizationId` filter (`src/app/candidates/import/actions.ts:77` is a representative example) and need no change.

### 3c. `ChoiceOption.field_name` lookups (1 site)

| # | File:line | Current | Fix |
|---|---|---|---|
| 1 | `src/app/settings/choices/actions.ts:136` | `prisma.choiceOption.findUnique({ where: { field_name: { field, name: newName } } })` | Becomes `findUnique({ where: { organizationId_field_name: { organizationId: orgId, field, name: newName } } })`. The action already has `orgId` in scope. |

Other ChoiceOption call sites (`findFirst` with `organizationId` filters,
`createMany`) are already org-aware and unaffected.

### 3d. `CustomField.entity_key` lookups (1 site)

| # | File:line | Current | Fix |
|---|---|---|---|
| 1 | `src/app/settings/custom-fields/actions.ts:82` | `prisma.customField.findUnique({ where: { entity_key: { entity, key } } })` | Becomes `findUnique({ where: { organizationId_entity_key: { organizationId: orgId, entity, key } } })`. |

### 3e. Sites verified safe

These look like they could collide but already filter by `organizationId`:

- `src/auth.ts:49` — `where: { email }` on **User** (User.email stays global).
- `src/app/users/actions.ts:43` — same.
- `src/lib/api-tokens.ts:46` — `where: { tokenHash }` on ApiToken (token stays global).
- `src/lib/ai/tools/create-user.ts:26` — `where: { email: args.email.toLowerCase() }` on User.
- `src/app/candidates/import/actions.ts:77` — already `findFirst({ where: { email, organizationId } })`.
- `src/app/api/external/candidates/route.ts:147` — already `findFirst` with org filter.
- All `prisma.candidate.findFirst({ where: { id, organizationId } })` patterns across `email-actions`, `jobs-actions`, `notes-actions`, `interviews/actions`, `sequences/actions`, `lib/ai/tools/{get,summarize,email}-candidate`, `lib/ai/candidate-worker` — confirmed org-scoped.

### 3f. Total breakage count

**8 call sites** need code edits to keep compiling after the schema change:
5 Tag upserts + 1 Candidate.email + 1 ChoiceOption + 1 CustomField.

---

## 4. Backfill checks before the NOT NULL flip

Run each query against the production DB. **Every count must be 0** before the
matching `ALTER COLUMN ... SET NOT NULL` is allowed:

```sql
SELECT 'Tag'                   AS model, count(*) FROM "Tag"                   WHERE "organizationId" IS NULL
UNION ALL SELECT 'ApiToken',              count(*) FROM "ApiToken"              WHERE "organizationId" IS NULL
UNION ALL SELECT 'AIConfig',              count(*) FROM "AIConfig"              WHERE "organizationId" IS NULL
UNION ALL SELECT 'Job',                   count(*) FROM "Job"                   WHERE "organizationId" IS NULL
UNION ALL SELECT 'Client',                count(*) FROM "Client"                WHERE "organizationId" IS NULL
UNION ALL SELECT 'ClientContact',         count(*) FROM "ClientContact"         WHERE "organizationId" IS NULL
UNION ALL SELECT 'Candidate',             count(*) FROM "Candidate"             WHERE "organizationId" IS NULL
UNION ALL SELECT 'Application',           count(*) FROM "Application"           WHERE "organizationId" IS NULL
UNION ALL SELECT 'Note',                  count(*) FROM "Note"                  WHERE "organizationId" IS NULL
UNION ALL SELECT 'KnowledgeItem',         count(*) FROM "KnowledgeItem"         WHERE "organizationId" IS NULL
UNION ALL SELECT 'EmailTemplate',         count(*) FROM "EmailTemplate"         WHERE "organizationId" IS NULL
UNION ALL SELECT 'EmailLog',              count(*) FROM "EmailLog"              WHERE "organizationId" IS NULL
UNION ALL SELECT 'Task',                  count(*) FROM "Task"                  WHERE "organizationId" IS NULL
UNION ALL SELECT 'CandidateList',         count(*) FROM "CandidateList"         WHERE "organizationId" IS NULL
UNION ALL SELECT 'SavedSearch',           count(*) FROM "SavedSearch"           WHERE "organizationId" IS NULL
UNION ALL SELECT 'Interview',             count(*) FROM "Interview"             WHERE "organizationId" IS NULL
UNION ALL SELECT 'ChoiceOption',          count(*) FROM "ChoiceOption"          WHERE "organizationId" IS NULL
UNION ALL SELECT 'Sequence',              count(*) FROM "Sequence"              WHERE "organizationId" IS NULL
UNION ALL SELECT 'AssistantConversation', count(*) FROM "AssistantConversation" WHERE "organizationId" IS NULL
UNION ALL SELECT 'CustomField',           count(*) FROM "CustomField"           WHERE "organizationId" IS NULL;
```

### 4a. Cleanup strategy for non-zero counts

For each row group with NULLs, decide between two options. The schema's
in-code comment (e.g. `// Org by scripts/migrate-to-multitenant.ts before
Phase 6 flips it NOT…`) refers to the historical backfill — it has already
run; any remaining NULLs are new rows created by one of the **Section 1a**
broken call sites (apply page, saved searches, admin-invite EmailLogs,
assistant email-candidate tool).

1. **Delete (if clearly test/garbage data)** — typically applies to
   `EmailLog` rows from the broken admin-invite + assistant paths since they
   pre-date the fixes:
   ```sql
   DELETE FROM "EmailLog" WHERE "organizationId" IS NULL;
   ```
2. **Assign to a "legacy" org** — better for `Candidate`, `Application`,
   `SavedSearch` so user-visible data survives the migration:
   ```sql
   -- one-time: ensure a legacy org exists
   INSERT INTO "Organization" (id, slug, name, "createdAt", "updatedAt")
   VALUES ('legacy', 'legacy', 'Legacy (pre-multi-tenant)', now(), now())
   ON CONFLICT (slug) DO NOTHING;

   UPDATE "Candidate"   SET "organizationId" = 'legacy' WHERE "organizationId" IS NULL;
   UPDATE "Application" SET "organizationId" = 'legacy' WHERE "organizationId" IS NULL;
   UPDATE "SavedSearch" SET "organizationId" = 'legacy' WHERE "organizationId" IS NULL;
   ```

Run the audit query again and confirm all zero before proceeding.

---

## 5. Smoke test plan (post-migration)

The goal: prove that two orgs can hold colliding rows (Phase 6 lets them)
and that one org cannot read or write into the other (lockdown holds).

### 5a. Seed

In a fresh DB (or a throwaway QA copy):

1. Create org **A** with admin `a-admin@example.com` and org **B** with admin
   `b-admin@example.com` (sign up via `/login/register` or seed directly).
2. As A's admin, create:
   - Tag named `DevOps`
   - Candidate `x@y.com`
   - ChoiceOption on `candidate.source` named `LinkedIn`
   - CustomField `candidate.linkedin_handle` (entity = CANDIDATE, key = linkedin_handle)
3. Sign out, sign in as B's admin, create the **identical** four rows. Each
   create must succeed (it would have raised a `P2002 unique constraint`
   error pre-Phase 6).

### 5b. Cross-tenant read isolation

While signed in as A:

- Note B's candidate id (look it up directly in Postgres as a one-off).
- Hit `GET /candidates/{B's candidate id}` — must respond **404**, not 200
  with B's data.
- Hit `GET /api/assistant/conversations/{B's conversation id}` (after B has
  one) — must respond **404**.
- Open `/settings/tags` — only A's tags appear. Same for `/settings/choices`
  and `/settings/custom-fields`.
- Open `/candidates` and search — only A's candidates list. The page's
  `where: { organizationId: orgId }` filter is the existing guard; lockdown
  just removes the "null leaks through" possibility.

### 5c. Cross-tenant write isolation

- Sign in as A's admin in the UI and copy A's API token. With that token,
  POST a new candidate to `/api/external/candidates`. The created row must
  have `organizationId = A`. Repeat with B's token — must end up in B.
  Crucially: a candidate with `email = "shared@example.com"` can now exist
  in both orgs (would have failed previously on `Candidate.email @unique`).
- As A in chat, try `enroll_in_sequence` with B's sequence id (you'll need
  to look one up in Postgres). The assistant tool must refuse with "not
  found" — every tool already passes `organizationId: ctx.organizationId`
  in its `where` clauses; lockdown's compound keys + NOT NULL just
  formalize what those filters already prove.

### 5d. Unique-collision spot-checks

- Sign in as A, open `/settings/tags`, try to create a second `DevOps` tag.
  UI must reject (compound `(organizationId, name)` collision).
- Sign in as B, create a `DevOps` tag — succeeds (this is the **point** of
  Phase 6).
- Repeat for ChoiceOption (`LinkedIn` under `candidate.source`) and
  CustomField (`candidate.linkedin_handle`).

---

## 6. Execution order

Do these in order. **Do not skip ahead** — every step depends on the previous.

1. **Section 1a fixes (code).** Patch the seven create sites missing
   `organizationId`. Build (`npx tsc --noEmit`), test, commit.
2. **Backfill audit (Section 4).** Run the NULL-count query. For any
   non-zero result, apply the cleanup strategy (delete or assign to
   `legacy`). Re-run; confirm zero.
3. **Section 3 code edits (compound-key call sites).** Patch the 8 sites
   listed in Sections 3a–3d. They still compile against the current schema
   because they're plain object literals — but they'll be wrong against
   the new schema. Order them with the schema edit (step 4) so a single
   commit lands code + schema together.
4. **Section 2 schema edits.** In `prisma/schema.prisma`:
   - Strip `?` from every `organizationId String?` (20 places — Section 1
     table).
   - Replace `Tag.name @unique` with `@@unique([organizationId, name])`.
   - Replace `Candidate.email @unique` with
     `@@unique([organizationId, email])`.
   - Replace `ChoiceOption @@unique([field, name])` with
     `@@unique([organizationId, field, name])`.
   - Replace `CustomField @@unique([entity, key])` with
     `@@unique([organizationId, entity, key])`.
5. **`npx prisma generate`.** Confirm the new compound key constants
   (`organizationId_name`, etc.) appear in the generated client.
6. **`npx tsc --noEmit`.** Must pass — verifies Section 3 edits cover
   every call site the compiler can see.
7. **`npx prisma db push --accept-data-loss`.** The flag is required
   because flipping a column NOT NULL is technically destructive in
   Prisma's eyes. The backfill in step 2 has made it safe.
8. **Section 5 smoke tests.** Run all four sub-sections in order.
9. **Commit + push.** One commit on its own:
   `Phase 6: schema lockdown — organizationId NOT NULL + per-org unique constraints`

### 6a. Rollback if something breaks

If the smoke tests fail and the cause is non-obvious:

```sql
-- Revert NOT NULLs (NOT the unique changes — those don't break reads)
ALTER TABLE "Tag" ALTER COLUMN "organizationId" DROP NOT NULL;
-- …and so on for each table.
```

Plus `git revert <phase-6 commit>` to restore the old schema file. The
compound-key constraints are harder to undo (Prisma manages the index name);
prefer to forward-fix rather than roll back at the constraint layer.

---

## Appendix — Source of every claim

- `grep -nE '@unique' prisma/schema.prisma` — every constraint line.
- `awk '/^model / { current = $2 } /organizationId String\?/ { print current ":" NR }' prisma/schema.prisma` — every scoped model.
- `grep -rnE 'prisma\.<modelName>\.(create|createMany)' src` for each of
  the 20 models — every create site.
- `grep -rnE 'findUnique|upsert' src/app src/lib 2>/dev/null | grep -E 'where: \{ (name|email|tokenHash)'` — every potentially-affected lookup.
- `grep -rn "Phase 6" src prisma` — cross-checked against the inline notes
  the Phase 3 author left behind. The four schema notes (`Tag.name`,
  `Candidate.email` implicitly, `ChoiceOption.@@unique`,
  `CustomField.@@unique`) all match this audit's conclusions.

This audit's commit: TBD (this is the first commit on the `phase-6-plan`
branch / commit). See the commit message in step 9.
