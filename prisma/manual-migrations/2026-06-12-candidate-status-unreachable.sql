-- Add UNREACHABLE to CandidateStatus: multiple contact attempts failed, no
-- response on any channel. Not an opt-out (that's DO_NOT_CONTACT) — retry
-- via other channels or revisit later.
-- Note: BLACKLISTED is kept as the stored value but relabeled in the UI as
-- "Do not submit / Internal block" (see src/lib/candidate-status.ts).
ALTER TYPE "CandidateStatus" ADD VALUE IF NOT EXISTS 'UNREACHABLE' AFTER 'OFF_MARKET';
