-- Structured Education + Certification sections for candidates.
-- Two new child tables that cascade from Candidate (same pattern as
-- CandidateReference / CandidateDocument). Purely additive and idempotent —
-- safe to apply to the shared DB without backfill. Degree levels and cert
-- kinds are ChoiceOption-backed (candidate.educationDegree /
-- candidate.certificationKind) and self-seed per org via ensureChoiceDefaults,
-- so no data seeding is needed here.

CREATE TABLE IF NOT EXISTS "CandidateEducation" (
  "id"              TEXT NOT NULL,
  "candidateId"     TEXT NOT NULL,
  "institution"     TEXT NOT NULL,
  "degree"          TEXT,
  "fieldOfStudy"    TEXT,
  "specialization"  TEXT,
  "startYear"       INTEGER,
  "endYear"         INTEGER,
  "inProgress"      BOOLEAN NOT NULL DEFAULT false,
  "gpa"             TEXT,
  "locationCity"    TEXT,
  "locationCountry" TEXT,
  "honors"          TEXT,
  "notes"           TEXT,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateEducation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CandidateEducation_candidateId_fkey" FOREIGN KEY ("candidateId")
    REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CandidateEducation_candidateId_idx"
  ON "CandidateEducation"("candidateId");

CREATE TABLE IF NOT EXISTS "CandidateCertification" (
  "id"                  TEXT NOT NULL,
  "candidateId"         TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "issuingOrganization" TEXT,
  "kind"                TEXT,
  "credentialId"        TEXT,
  "credentialUrl"       TEXT,
  "jurisdiction"        TEXT,
  "issueDate"           TIMESTAMP(3),
  "expirationDate"      TIMESTAMP(3),
  "doesNotExpire"       BOOLEAN NOT NULL DEFAULT false,
  "inProgress"          BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt"          TIMESTAMP(3),
  "verifiedById"        TEXT,
  "notes"               TEXT,
  "sortOrder"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateCertification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CandidateCertification_candidateId_fkey" FOREIGN KEY ("candidateId")
    REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CandidateCertification_verifiedById_fkey" FOREIGN KEY ("verifiedById")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CandidateCertification_candidateId_idx"
  ON "CandidateCertification"("candidateId");

-- Supports "certs expiring within N days" without a stored status column.
CREATE INDEX IF NOT EXISTS "CandidateCertification_expirationDate_idx"
  ON "CandidateCertification"("expirationDate");
