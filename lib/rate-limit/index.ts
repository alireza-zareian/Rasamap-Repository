import "server-only";
import { createMemoryStore, createRedisStore, type RateLimitOptions, type RateLimitResult } from "./stores";

/**
 * Every limit the app enforces, as a named policy: the numbers live here and a
 * route names the policy it applies. The counters are in ./stores.ts — in
 * memory for one process, in Redis when REDIS_URL is set.
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
 * A credential attempt, checked on two dimensions that answer different
 * questions:
 *
 *   account — a few tries, then a lockout. This is the brute-force defence,
 *             and no header moves a caller off it.
 *   address — a high ceiling with no lockout, against a flood from one source.
 *             One address can be a whole office or carrier, so it never locks.
 *
 * The account key is the identifier the visitor typed, trimmed and lowercased
 * so "Ali@X.com " and "ali@x.com" share one budget, and hashed so the store
 * holds no list of attempted emails or phone numbers.
 */
export interface CredentialAttempt {
  result: RateLimitResult;
  /** Which dimension refused — the caller phrases the message. */
  limitedBy: "account" | "address" | null;
}

function accountKey(identifier: string): string {
  const norm = identifier.trim().toLowerCase();
  // djb2: a store key, not a secret — it only has to be stable and not the identifier itself.
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * `device` is this browser's device token for the account (lib/auth/device.ts),
 * or null. A known device counts on its own budget, so strangers locking an
 * account out never lock out the browser its owner already signs in from.
 *
 * The account is checked first, so a caller who has really used up its tries
 * is told that rather than that the network is busy.
 */
async function credentialAttempt(
  scope: string,
  identifier: string,
  ip: string,
  device: string | null,
  account: RateLimitOptions,
  address: RateLimitOptions,
): Promise<CredentialAttempt> {
  const acctKey = device ? `${scope}_dev:${device}` : `${scope}_acct:${accountKey(identifier)}`;
  const acct = await checkRateLimit(acctKey, account);
  if (!acct.allowed) return { result: acct, limitedBy: "account" };

  const addr = await checkRateLimit(`${scope}_ip:${ip}`, address);
  if (!addr.allowed) return { result: addr, limitedBy: "address" };

  return { result: addr, limitedBy: null };
}

/** Staff sign-in: five tries per email, then a 15-minute wait. */
export function adminLoginAttempt(email: string, ip: string, device: string | null): Promise<CredentialAttempt> {
  return credentialAttempt("login", email, ip, device,
    { windowMs: 15 * 60 * 1000, maxRequests: 5,   lockoutMs: 15 * 60 * 1000 },
    { windowMs: 15 * 60 * 1000, maxRequests: 100, lockoutMs: 0 },
  );
}

/** Customer sign-in: ten tries and a shorter wait — a phone and password are mistyped more often than an email. */
export function userLoginAttempt(identifier: string, ip: string, device: string | null): Promise<CredentialAttempt> {
  return credentialAttempt("user_login", identifier, ip, device,
    { windowMs: 15 * 60 * 1000, maxRequests: 10,  lockoutMs: 10 * 60 * 1000 },
    { windowMs: 15 * 60 * 1000, maxRequests: 150, lockoutMs: 0 },
  );
}

/** Clear an account's failures (and this device's) after a successful sign-in. */
export async function resetAccountAttempts(scope: CredentialScope, identifier: string, device: string | null = null): Promise<void> {
  await store.reset(`${scope}_acct:${accountKey(identifier)}`);
  if (device) await store.reset(`${scope}_dev:${device}`);
}

// The policies below have no lockout on purpose: each is keyed on an address
// that a whole office can share, or bounds a cost the window alone contains. A
// burst from a real person should end when the window rolls over.

/** Admin API: far above real use, only to bound a runaway script. */
export function adminApiRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`admin_api:${ip}`, {
    windowMs:    60 * 1000,
    maxRequests: 600,
    lockoutMs:   0,
  });
}

/** Signed-in writes (a listing, a review, a phone reveal), per address. Per-account limits are below. */
export function userApiRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`user_api:${ip}`, {
    windowMs:    60 * 1000,
    maxRequests: 300,
    lockoutMs:   0,
  });
}

/**
 * Registration, per address. A flood still meets the ceiling; what stops bulk
 * sign-up is the verified phone number, not a door that shuts the sixth person
 * in an office out for an hour.
 */
export function registrationRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`register:${ip}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 40,
    lockoutMs:   0,
  });
}

/** OTP send, per phone: three in ten minutes, then a lockout — each one is a paid SMS to someone's phone. */
export function otpSendRateLimit(phone: string): Promise<RateLimitResult> {
  return checkRateLimit(`otp_send:${phone}`, {
    windowMs:    10 * 60 * 1000,
    maxRequests: 3,
    lockoutMs:   10 * 60 * 1000,
  });
}

/** OTP send, per address: stops one client fanning out across many numbers. */
export function otpSendIpRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`otp_send_ip:${ip}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 40,
    lockoutMs:   0,
  });
}

/** OTP verify, per phone. Each code also allows only 5 attempts; this bounds guessing across fresh codes. */
export function otpVerifyRateLimit(phone: string): Promise<RateLimitResult> {
  return checkRateLimit(`otp_verify:${phone}`, {
    windowMs:    10 * 60 * 1000,
    maxRequests: 10,
    lockoutMs:   10 * 60 * 1000,
  });
}

/**
 * Owner phone reveals, per account. The phone is the one thing the catalogue
 * does not give away; keyed on the account, one sign-up cannot carry off every
 * number however many addresses it uses.
 */
export function contactRevealRateLimit(accountKey: string): Promise<RateLimitResult> {
  return checkRateLimit(`contact_reveal:${accountKey}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 40,
    lockoutMs:   0,
  });
}

/**
 * Writes per account, whatever address they come from. Without these one
 * account could submit listings — each with up to ten photos — as fast as the
 * per-address ceiling allowed, and fill the disk.
 */
const ACCOUNT_WRITES = {
  listing: { windowMs: 60 * 60 * 1000, maxRequests: 10, lockoutMs: 0 },
  reply:   { windowMs: 10 * 60 * 1000, maxRequests: 30, lockoutMs: 0 },
  review:  { windowMs: 10 * 60 * 1000, maxRequests: 30, lockoutMs: 0 },
  // A heart is tapped on and off while browsing; this is a loop, not a person.
  favorite: { windowMs: 10 * 60 * 1000, maxRequests: 120, lockoutMs: 0 },
} satisfies Record<string, RateLimitOptions>;

export function accountWriteRateLimit(kind: keyof typeof ACCOUNT_WRITES, accountKey: string): Promise<RateLimitResult> {
  return checkRateLimit(`write_${kind}:${accountKey}`, ACCOUNT_WRITES[kind]);
}

/**
 * GET /api/billboards. No page calls it, so its callers are programs, and it is
 * the cleanest copy of the catalogue on offer. With the route's page-depth cap,
 * one address reads at most 60 × 48 rows per ten minutes (§20b). A crawler on
 * many addresses, or one reading the HTML, is not bounded here (§20a).
 */
export function catalogueApiRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`catalogue_api:${ip}`, {
    windowMs:    10 * 60 * 1000,
    maxRequests: 60,
    lockoutMs:   0,
  });
}

/** Read endpoints the site's own pages call (a media item, stats, analytics, who is signed in). */
export function publicApiRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`public_api:${ip}`, {
    windowMs:    60 * 1000,
    maxRequests: 600,
    lockoutMs:   0,
  });
}
