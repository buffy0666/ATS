/**
 * Sentinel value the AIConfigForm sends when the API-key field is untouched.
 * The server uses this to know "keep the existing encrypted key" vs "the
 * admin cleared the field intentionally". Lives outside actions.ts because
 * "use server" files can only export async functions.
 */
export const KEY_UNCHANGED = "__unchanged__";
