/**
 * Pilot signup gate. Public self-serve registration is off unless explicitly
 * re-enabled. Existing login and membership are unaffected.
 */
export function isPublicSignupEnabled(): boolean {
  return process.env.ALLOW_PUBLIC_SIGNUP?.trim().toLowerCase() === "true";
}
