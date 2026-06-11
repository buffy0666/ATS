import { CandidateStatus } from "@/generated/prisma";

// Single source of truth for candidate status labels, definitions, and badge
// colors. Key order here drives dropdown order. Definitions are surfaced as
// hover tooltips wherever statuses are selectable, and mirrored in the
// Knowledgebase article "Candidate Status Definitions" — keep both in sync.
export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  ACTIVE: "Active",
  PASSIVE: "Passive",
  OFF_MARKET: "Off market",
  PLACED: "Placed",
  ALUMNI: "Alumni",
  ON_HOLD: "On hold",
  DO_NOT_CONTACT: "Do not contact",
  BLACKLISTED: "Blacklisted",
};

export const CANDIDATE_STATUS_DESCRIPTION: Record<CandidateStatus, string> = {
  ACTIVE: "Actively looking and engaged with us right now.",
  PASSIVE: "Employed and not searching, but open to the right opportunity.",
  OFF_MARKET:
    "Took another position or stopped looking — relationship is good; keep warm and re-engage in 6–12 months.",
  PLACED: "Currently working in a role we placed them in.",
  ALUMNI: "Previously placed by us; that engagement has ended.",
  ON_HOLD: "Temporarily paused (timing, personal, visa). Revisit when circumstances change.",
  DO_NOT_CONTACT:
    "Explicitly asked not to be contacted. Consent-level: never solicit, regardless of fit.",
  BLACKLISTED:
    "Integrity problem (no-shows, falsified credentials, burned a client). Do not engage.",
};

export const CANDIDATE_STATUS_BADGE: Record<CandidateStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  PASSIVE: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  OFF_MARKET: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
  PLACED: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  ALUMNI: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  ON_HOLD: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  DO_NOT_CONTACT: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  BLACKLISTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

/** Ordered option list for selects: value, label, and tooltip description. */
export function candidateStatusOptions() {
  return (Object.keys(CANDIDATE_STATUS_LABEL) as CandidateStatus[]).map((k) => ({
    value: k,
    label: CANDIDATE_STATUS_LABEL[k],
    title: CANDIDATE_STATUS_DESCRIPTION[k],
  }));
}
