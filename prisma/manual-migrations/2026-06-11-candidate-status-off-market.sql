-- Add OFF_MARKET to CandidateStatus: candidates who took another position or
-- stopped looking — relationship intact, re-engage later. Distinct from
-- DO_NOT_CONTACT (consent) and BLACKLISTED (behavior).
-- Safe/additive: existing rows and code are unaffected.
ALTER TYPE "CandidateStatus" ADD VALUE IF NOT EXISTS 'OFF_MARKET' AFTER 'PASSIVE';
