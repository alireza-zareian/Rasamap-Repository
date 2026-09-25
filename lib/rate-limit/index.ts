import "server-only";
import { createMemoryStore, createRedisStore, type RateLimitOptions, type RateLimitResult } from "./stores";

/**
 * RASAMAP — rate limits.
 *
 * Every limit the app enforces is a named policy below, so the numbers live in
 * one file and a route names the policy it applies rather than inventing one.
 * The counters themselves live in ./stores.ts: in memory for one process, in
 * Redis when REDIS_URL is set.
 */

export type { RateLimitOptions, RateLimitResult };

const memory = createMemoryStore();
const store = process.env.REDIS_URL ? createRedisStore(process.env.REDIS_URL, memory) : memory;

export function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  return store.hit(key, opts);
}

/** Whole seconds until the caller may retry (lockout end, else window end). */
export function retryAfterSeconds(r: RateLimitResult): number {
  const until = r.lockedUntil ?? r.resetAt;
  return Math.max(1, Math.ceil((until - Date.now()) / 1000));
}

/** The two credential forms: the staff-only form and the shared public one. */
export type CredentialScope = "login" | "user_login";

/**
 * A credential attempt, judged on two independent questions.
 *
 * Guessing a password means attacking **one account**, so that is where the
 * tight limit belongs. The address is a far weaker signal: in production behind
 * a proxy, one public address carries a whole university, office or mobile
 * carrier, and — as card B1 records — without a proxy the address is a value
 * the caller can simply choose. A control that rests on it alone is both too
 * harsh on real people and trivially escaped by anyone who reads this file.
 *
 * So both are checked, and they are asked different questions:
 *
 *   account — 5 tries, then a short lockout. This is the real brute-force
 *             defence, and no header can move a caller off it.
 *   address — a high ceiling with **no lockout**, as a backstop against a flood
 *             from one source. The window rolling over frees it, so a shared
 *             address never strands the people behind it.
 *
 * The account key is an identifier the visitor typed. It is lowercased and
 * trimmed so "Ali@X.com " and "ali@x.com" are one account rather than two
 * budgets, and hashed so the store never holds a list of attempted emails and
 * phone numbers in memory.
 */
export interface CredentialAttempt {
  /** Refused, and which dimension refused it — the caller phrases the message. */
  result: RateLimitResult;
  limitedBy: "account" | "address" | null;
}

/** Keep the in-memory store free of readable identifiers. */
function accountKey(identifier: string): string {
  const norm = identifier.trim().toLowerCase();
  // djb2 — this is a cache key, not a security boundary. It only needs to be
  // stable and to not be the identifier itself.
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Both dimensions of one credential attempt.
 *
 * The account is checked first so that a caller who has genuinely exhausted one
 * account's tries is told so, rather than being told the network is busy.
 */
async function credentialAttempt(
  scope: string,
  identifier: string,
  ip: string,
  account: RateLimitOptions,
  address: RateLimitOptions,
): Promise<CredentialAttempt> {
  const acct = await checkRateLimit(`${scope}_acct:${accountKey(identifier)}`, account);
  if (!acct.allowed) return { result: acct, limitedBy: "account" };

  const addr = await checkRateLimit(`${scope}_ip:${ip}`, address);
  if (!addr.allowed) return { result: addr, limitedBy: "address" };

  return { result: addr, limitedBy: null };
}

/**
 * Staff sign-in. Five tries against one email, then that email waits a quarter
 * of an hour; the address gets a much looser ceiling and is never locked.
 */
export function adminLoginAttempt(email: string, ip: string): Promise<CredentialAttempt> {
  return credentialAttempt("login", email, ip,
    { windowMs: 15 * 60 * 1000, maxRequests: 5,   lockoutMs: 15 * 60 * 1000 },
    { windowMs: 15 * 60 * 1000, maxRequests: 100, lockoutMs: 0 },
  );
}

/**
 * Customer sign-in. Ten rather than five, because a phone number and a password
 * are more often mistyped than an email is, and the account lockout is shorter
 * for the same reason.
 */
export function userLoginAttempt(identifier: string, ip: string): Promise<CredentialAttempt> {
  return credentialAttempt("user_login", identifier, ip,
    { windowMs: 15 * 60 * 1000, maxRequests: 10,  lockoutMs: 10 * 60 * 1000 },
    { windowMs: 15 * 60 * 1000, maxRequests: 150, lockoutMs: 0 },
  );
}

/** Clear an account's failures after it signs in successfully. */
export function resetAccountAttempts(scope: CredentialScope, identifier: string): Promise<void> {
  return store.reset(`${scope}_acct:${accountKey(identifier)}`);
}

/**
 * Specific preset: admin API — a ceiling, not a throttle.
 *
 * A staff member working through the approval queue fires a burst of reads per
 * minute (the table, a listing's photos, the audit tab), so the number is set
 * far above real use and exists only to bound a runaway script. No lockout: an
 * admin who trips this is working, not attacking, and should be free again when
 * the window rolls over rather than locked out of their own panel.
 */
export function adminApiRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`admin_api:${ip}`, {
    windowMs:    60 * 1000,
    maxRequests: 600,
    lockoutMs:   0,
  });
}

/**
 * Specific preset: user API — the signed-in write paths (a listing, a review, a
 * phone reveal).
 *
 * Well above real interactive use, because several people behind one office or
 * campus NAT share a single address and spend this budget between them. No
 * lockout, for the same reason the public read limit has none: an accidental
 * burst — double-taps on a failing form — must not cost a real person the
 * 15-minute penalty that belongs to credential guessing.
 */
export function userApiRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`user_api:${ip}`, {
    windowMs:    60 * 1000,
    maxRequests: 300,
    lockoutMs:   0,
  });
}

/**
 * Registration, per address.
 *
 * This used to be five an hour followed by an hour-long lockout, which meant
 * the sixth person to sign up from an office or a campus was refused for the
 * rest of the hour — and, since the hour restarted on every further attempt,
 * for as long as anyone kept trying. Bulk sign-up is a real concern, but the
 * defence that actually answers it is a verified phone number (card B7), not a
 * closed front door.
 *
 * So: a ceiling that a flood still meets, and no lockout, so a legitimate queue
 * of people drains as the window rolls rather than being shut out by the first
 * five.
 */
export function registrationRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`register:${ip}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 40,
    lockoutMs:   0,
  });
}

/** OTP send — per phone: 3 per 10 min, 10 min lockout (SMS costs money and
 *  spamming a number is abuse). Verify is limited separately per phone. */
export function otpSendRateLimit(phone: string): Promise<RateLimitResult> {
  return checkRateLimit(`otp_send:${phone}`, {
    windowMs:    10 * 60 * 1000,
    maxRequests: 3,
    lockoutMs:   10 * 60 * 1000,
  });
}

/**
 * OTP send, per address — a backstop so one client cannot fan out across many
 * numbers. The per-phone cap above is what actually bounds the SMS bill, and it
 * is keyed on the thing being abused, so this one does not need a lockout: a
 * shared address that trips it would otherwise take everyone behind it out of
 * the password-reset flow for half an hour.
 */
export function otpSendIpRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`otp_send_ip:${ip}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 40,
    lockoutMs:   0,
  });
}

/** OTP verify — per phone: 10 attempts per 10 min (the code itself is also
 *  attempt-capped at 5; this stops brute-forcing across fresh codes). */
export function otpVerifyRateLimit(phone: string): Promise<RateLimitResult> {
  return checkRateLimit(`otp_verify:${phone}`, {
    windowMs:    10 * 60 * 1000,
    maxRequests: 10,
    lockoutMs:   10 * 60 * 1000,
  });
}

/**
 * Owner phone reveals, per account.
 *
 * The phone number is the one thing the catalogue does not give away, and the
 * per-address limit around it is no guard: an address is shared by a whole
 * office and, without a proxy in front, chosen by the caller. Keyed on the
 * account instead, a single sign-up can no longer walk the catalogue and carry
 * off every number. Forty an hour is far past what a person comparing media
 * needs; no lockout, so the budget simply refills.
 */
export function contactRevealRateLimit(accountKey: string): Promise<RateLimitResult> {
  return checkRateLimit(`contact_reveal:${accountKey}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 40,
    lockoutMs:   0,
  });
}

/**
 * Public API rate limit — applied to /api/billboards to slow automated
 * crawling. Normal browser usage never comes close to this ceiling.
 */
export function publicApiRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`public_api:${ip}`, {
    windowMs:    60 * 1000,
    maxRequests: 600,
    // No lockout. A read endpoint that punishes past the window it measures
    // turns a burst of curiosity into ten minutes of a broken site, and a
    // shared address (one office, one campus Wi-Fi) spends this budget between
    // everyone behind it. The window alone is enough to bound the cost.
    lockoutMs:   0,
  });
}
