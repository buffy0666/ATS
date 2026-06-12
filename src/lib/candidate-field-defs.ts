// Hover-definition content for the candidate Rating and Rejection Reason
// fields, mirroring how candidate-status.ts holds the Status definitions.
// Surfaced as the hover legend (the ⓘ next to the field label) and as
// per-option tooltips in the inline editor.

/** 1–5 rating rubric. Keep in sync with any Knowledgebase rating guidance. */
export const RATING_DEFINITION: Record<number, string> = {
  1: "Poor fit; not worth pursuing.",
  2: "Weak fit; significant gaps.",
  3: "Possible fit; worth a conversation.",
  4: "Strong fit; prioritize.",
  5: "Excellent fit; top prospect.",
};

/**
 * Definitions for the *seeded* rejection reasons (candidate.rejectionReason
 * ChoiceOption defaults), keyed by the option name. Org-custom reasons that
 * aren't listed here simply render without a definition — the lookup falls
 * back to the bare label.
 */
export const REJECTION_REASON_DEFINITION: Record<string, string> = {
  Compensation: "Pay or comp package didn't meet expectations.",
  "Location / Relocation": "Unwilling or unable to be in the required location.",
  "Remote Policy": "Onsite / hybrid / remote expectations didn't align.",
  "Role Fit": "Skills or experience didn't match the role.",
  Timing: "Not the right time (personal or market).",
  "Accepted Another Offer": "Took a different opportunity.",
  Counteroffer: "Stayed after their current employer countered.",
  "Company / Industry Fit": "Not interested in the company or industry.",
  "Visa / Sponsorship": "Work-authorization or sponsorship mismatch.",
  "Contract vs Perm": "Engagement type (contract vs permanent) didn't fit.",
  Benefits: "Benefits package fell short.",
  Other: "Reason not captured by the standard options.",
};
