-- Revamp the CallOutcome enum: replace the old 4-value set
-- (BAD_NUMBER / LEFT_VM / NO_ANSWER / NOT_INTERESTED) with the new
-- sales-oriented set, grouped Connected-first then Not-Connected.
--
-- Existing rows are remapped in the same atomic swap:
--   LEFT_VM    -> LEFT_VOICEMAIL
--   BAD_NUMBER -> WRONG_NUMBER
--   (NO_ANSWER and NOT_INTERESTED carry over unchanged)
--
-- Done as a rename + recreate + ALTER COLUMN ... USING so it's a single
-- transaction and leaves the enum in exactly the order schema.prisma
-- declares (so `prisma db push` afterwards reports no drift).

BEGIN;

ALTER TYPE "CallOutcome" RENAME TO "CallOutcome_old";

CREATE TYPE "CallOutcome" AS ENUM (
  'CONNECTED',
  'INTERESTED',
  'MEETING_BOOKED',
  'CALLBACK_REQUESTED',
  'NOT_INTERESTED',
  'GATEKEEPER',
  'DO_NOT_CALL',
  'LEFT_VOICEMAIL',
  'NO_ANSWER',
  'BUSY',
  'WRONG_NUMBER',
  'NO_LONGER_AT_COMPANY',
  'MISSED_CALL'
);

ALTER TABLE "ContactLog"
  ALTER COLUMN outcome TYPE "CallOutcome"
  USING (
    CASE outcome::text
      WHEN 'LEFT_VM'    THEN 'LEFT_VOICEMAIL'
      WHEN 'BAD_NUMBER' THEN 'WRONG_NUMBER'
      ELSE outcome::text
    END
  )::"CallOutcome";

DROP TYPE "CallOutcome_old";

COMMIT;
