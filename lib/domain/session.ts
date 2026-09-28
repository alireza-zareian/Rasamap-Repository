/**
 * How long a sign-in lasts; the data layer enforces both, the cookie lives as
 * long as the longer.
 *
 *   idle      — ends after this long without a request; a request in the
 *               second half of the window extends it.
 *   absolute  — ends this long after sign-in regardless, so a copied cookie
 *               cannot be kept alive for ever.
 */
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;               // 8 hours
export const SESSION_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
