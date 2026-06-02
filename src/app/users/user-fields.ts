// Shared (client- AND server-safe) config for the editable User profile /
// technology fields surfaced on /users/[id] and the /users table. No
// "use server" / server-only imports here.

/**
 * Phone systems a user can be on. Stored on User.phoneSystems as a scalar
 * string list (the display strings themselves). "Other" is just a plain
 * selectable option — no free-text follow-up. Append additively; never
 * rename an existing value or old rows stop matching.
 */
export const PHONE_SYSTEM_OPTIONS = [
  "Zoom Phone",
  "Ring Central",
  "PhoneBurner",
  "AirCall",
  "8x8",
  "Other",
] as const;

export type PhoneSystem = (typeof PHONE_SYSTEM_OPTIONS)[number];

/** Drop anything not in the option list (defends the scalar-list column). */
export function sanitizePhoneSystems(values: string[]): string[] {
  const allowed = new Set<string>(PHONE_SYSTEM_OPTIONS);
  // De-dupe while preserving the canonical option order.
  return PHONE_SYSTEM_OPTIONS.filter((opt) => values.includes(opt) && allowed.has(opt));
}
