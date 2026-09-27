/**
 * How long a sign-in lasts. Read by the data layer, which enforces both, and by
 * the cookie, which the browser keeps for the longer of the two.
 *
 *   idle      — this long without a request and the session ends. A request
 *               in the second half of the window pushes it forward.
 *   absolute  — this long after signing in it ends however busy it is, so a
 *               copied cookie cannot be kept alive for ever.
 */
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;               // 8 hours
export const SESSION_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
