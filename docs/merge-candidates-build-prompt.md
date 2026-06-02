# Build prompt: Merge Candidates feature

> Hand this whole file to a fresh Claude working in the `C:\Users\afj\CodingProjects\ATS`
> repo. It is self-contained. Read the referenced files before writing code.

## Context you must load first

This is a multi-tenant Next.js 16 (App Router) + Prisma/Postgres ATS. Every
business row is scoped by `organizationId`. **This DB is shared and co-developed
with other agents — make additive changes, never destructive schema rewrites.**

Read these before starting:
- `prisma/schema.prisma` — the `Candidate` model and **every relation that points
  at it** (this is the heart of the task).
- `src/app/candidates/SelectionToolbar.tsx` — existing multi-select bulk-action
  toolbar + modal patterns. Reuse `ModalShell`, button styles, and the
  `selectedIds` flow.
- `src/app/candidates/bulk-actions.ts` — the canonical server-action shape:
  `requireSessionWithOrg()`, `sanitizeIds()`, `filterCandidateIdsToOrg()`,
  org-scoped `where` clauses, `revalidatePath`, `BulkActionResult`.
- `src/app/candidates/delete-action.ts` — how a candidate is removed today,
  including the audit call (`auditDelete`) and `deleteCustomFieldValuesFor`.
- `src/app/candidates/[id]/page.tsx` — the candidate detail layout, to mirror the
  metadata grouping (Identity / Contact / Location / Career / Compensation /
  Focus / Links / Source & ownership) on the compare screen.
- `src/lib/auth-utils.ts` — `requireSessionWithOrg()`, role helpers.
- `src/lib/audit/write.ts` — audit helpers (`auditDelete`, `recordAuditEvent` or
  equivalent). The merge MUST write an audit row.

## What to build

A **Merge Candidates** workflow:

1. **Entry button.** On the candidates list (`src/app/candidates/CandidatesView.tsx`),
   when **exactly two** candidates are selected, surface a **"Merge…"** action in
   the existing `SelectionToolbar` (the floating pill at the bottom). It is hidden
   for 0, 1, or 3+ selections. Clicking it navigates to
   `/candidates/merge?a=<id>&b=<id>`.
   - Also add a secondary entry point: a small "Merge" link/button near the list
     header toolbar (by "Advanced filters" / "Showing X of Y") that explains you
     must select two candidates first (or opens a candidate picker). Toolbar entry
     is the primary path; keep the header hint lightweight.

2. **Compare / merge page** at `src/app/candidates/merge/page.tsx` (server
   component) + a client component `MergeClient.tsx`:
   - Loads both candidates **org-scoped** (`findFirst({ where: { id, organizationId }})`).
     If either is missing or they're equal, `notFound()`.
   - Renders the two candidates **side by side**, grouped by the same sections as
     the detail page, each group independently scrollable on tall content.
   - A **"Primary record" selector** at the top (radio: Candidate A | Candidate B).
     The primary is the row that survives; the other is the secondary (deleted at
     the end). Default primary = the one with more data / older `createdAt` (pick a
     simple heuristic and state it in the UI).
   - **Per-field winner control.** For each scalar/array field where the two differ,
     show both values and let the user pick which wins (default = primary's value,
     unless primary's is null/empty and secondary has one → default to secondary).
     Fields with identical values render collapsed/non-interactive.
   - A clear summary of what will be **combined vs. chosen**: relations (notes,
     emails, contact logs, applications, interviews, sequence enrollments, list
     memberships, tags, documents, references, activities, custom-field values) are
     **merged/transferred**, not chosen; scalar profile fields are **chosen**.
   - Confirm button → calls the `mergeCandidates` server action → on success
     redirects to `/candidates/<primaryId>`.

3. **`mergeCandidates` server action** in `src/app/candidates/merge/actions.ts`.
   Signature roughly:
   ```ts
   mergeCandidates(input: {
     primaryId: string;
     secondaryId: string;
     fieldChoices: Record<string, "primary" | "secondary">;
   }): Promise<{ ok: true; primaryId: string } | { ok: false; error: string }>
   ```

## Merge semantics (the important part)

Run the whole thing inside a single `prisma.$transaction`. Both ids must be
verified to belong to the caller's org first (reuse `filterCandidateIdsToOrg`).
Restrict to roles allowed to delete (treat merge as destructive — match or
exceed `deleteCandidate`'s implicit gate; if unsure require ADMIN/OWNER and ask).

### A. Scalar / array profile fields → apply `fieldChoices`
Update the **primary** row: for every field where `fieldChoices[field] === "secondary"`,
copy the secondary's value onto the primary. Otherwise keep primary's. Cover the
editable fields from the detail page (names, contact, location, work auth, career,
compensation, availability, focus arrays, links, status, rating, source, summary,
skills, workHistory, education, etc.). Email is special — see gotchas.

### B. Child relations → re-point from secondary to primary
Enumerate from the schema. For each relation on `Candidate`, reassign rows from
`secondaryId` to `primaryId`. **Mind the unique constraints** — a naive
`updateMany` will throw `P2002` where the primary already has a sibling row:

| Relation (model) | FK | Reassign strategy |
|---|---|---|
| `Note` (`CandidateNoteThreads`) | `candidateId` | `updateMany` → primary. (Notes merge wholesale.) |
| `EmailLog` | `candidateId` | `updateMany` → primary (correspondence merged). |
| `ContactLog` | `candidateId` | `updateMany` → primary. |
| `Application` | `candidateId` | **De-dupe on `@@unique([jobId, candidateId])`.** If primary already has an Application for the same `jobId`, keep primary's (or the further-along `stage`) and delete the secondary's; otherwise re-point. Re-point that Application's child `Note`/`EmailLog`/`Interview`/`SequenceEnrollment` first. |
| `Interview` | `candidateId` | `updateMany` → primary. |
| `SequenceEnrollment` | `candidateId` | **De-dupe on `@@unique([sequenceId, candidateId])`** — drop secondary's enrollment if primary already enrolled in that sequence, else re-point (and its `StepRun`s follow). |
| `CandidateListMember` | `candidateId` | **De-dupe on `@@unique([listId, candidateId])`** — `updateMany ... skipDuplicates` semantics: re-point where primary isn't a member, delete where it is. |
| `Tag` (m:n) | implicit join | Union the tag sets onto primary (`connect` all of secondary's tags). |
| `CandidateDocument` | `candidateId` | `updateMany` → primary. |
| `CandidateReference` | `candidateId` | `updateMany` → primary. |
| `CandidateActivity` | `candidateId` | `updateMany` → primary. Add a synthetic activity row noting the merge. |
| `CandidateEEO` | `candidateId @unique` | One-to-one. Keep primary's if present; else re-point secondary's. Never merge field-by-field silently — EEO is legally gated. |
| Custom field values | `entityId` (polymorphic, see `src/lib/custom-fields.ts`) | Move secondary's values to primary where primary has none for that field; otherwise honor `fieldChoices` or keep primary. Clean up leftovers via the same helper `deleteCandidate` uses. |

Verify this table against the live schema — add any relation that's been introduced
since this prompt was written. **Do not leave any FK pointing at the secondary**, or
the final delete will fail or orphan data.

### C. Delete the secondary
After all rows are re-pointed, hard-delete the secondary candidate
(`prisma.candidate.delete`/`deleteMany` scoped to org), mirroring
`delete-action.ts` (custom-field cleanup + audit).

### D. Audit
Write one audit event capturing the merge: action type (reuse an existing
`AuditAction` or add a new enum value `CANDIDATE_MERGE` additively if appropriate —
check `prisma/schema.prisma`), `entityType: "Candidate"`, `entityId: primaryId`,
and metadata `{ mergedFromId: secondaryId, mergedFromLabel, fieldChoices, counts: {...} }`.
Also `auditDelete` the secondary so its disappearance is explained.

## Gotchas / constraints

- **Per-org email uniqueness:** `Candidate` has `@@unique([organizationId, email])`.
  Both candidates share an org, so they have different emails. If the user chooses
  the secondary's email as the winner, the secondary still exists at update time →
  you'd collide. Order matters: re-point relations and apply field choices, then
  set the primary's email LAST (or set it after deleting the secondary). Safer:
  delete secondary first, then apply the chosen email to primary. Sequence the
  transaction so no unique constraint is violated mid-flight.
- **`lastContactedAt` / `nextFollowUpAt`:** when merging, prefer the most recent
  `lastContactedAt` and the soonest future `nextFollowUpAt` regardless of the
  primary choice (call this out in the UI). Optional but sensible.
- Everything is org-scoped — never trust the ids from the query string without the
  `organizationId` filter.
- Wrap in `$transaction` so a failure leaves both candidates intact.
- `revalidatePath("/candidates")` and the primary detail path after success.

## Acceptance criteria

1. Selecting exactly two candidates shows **Merge…**; other counts don't.
2. The merge page shows both candidates side by side with scrollable groups and a
   working primary + per-field winner UI.
3. Confirming merges: secondary's notes, emails, contact logs, interviews,
   applications (de-duped), sequence enrollments (de-duped), list memberships
   (de-duped), tags (unioned), documents, references, activities, and custom-field
   values all end up on the primary; chosen scalar fields win; secondary is deleted.
4. No `P2002` errors on candidates that share a job/sequence/list.
5. An audit row records the merge and the secondary's deletion.
6. `npx tsc --noEmit` passes. Cross-tenant ids are rejected (can't merge across orgs).

## Workflow expectations

- Branch off `main`, keep commits scoped, run `npx tsc --noEmit` before pushing.
- Co-Authored-By trailer on commits, per repo convention.
- If any relation's de-dupe behavior is genuinely ambiguous (e.g. conflicting
  Application stages), ask the human rather than guessing.
