/**
 * RASAMAP — Rate Limiter
 *
 * In-memory sliding window rate limiter.
 * Production note: for multi-instance deployments, replace with Redis-backed
 * rate limiting (e.g. @upstash/ratelimit).
 */

interface Window {
  count:     number;
  resetAt:   number;
  lockedUntil?: number;
}

const store = new Map<string, Window>();

// Hard cap on tracked keys. A distributed flood (one key per source IP) must not
// let this Map grow without bound. When the cap is hit, drop the oldest-inserted
// entries first (Map preserves insertion order) — a key that is still being
// hammered gets re-added on its next request, so active limiters survive.
const MAX_KEYS = 50_000;

function evictIfNeeded() {
  if (store.size <= MAX_KEYS) return;
  const drop = store.size - MAX_KEYS + 1000; // trim a slug at once, not one-by-one
  let n = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++n >= drop) break;
  }
}

// Clean expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, w] of store.entries()) {
      if (w.resetAt < now && (!w.lockedUntil || w.lockedUntil < now)) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  // Don't keep the process alive just for the sweeper.
  timer.unref?.();
}

export interface RateLimitOptions {
  /** Window duration in milliseconds */
  windowMs:    number;
  /** Max requests allowed within the window */
  maxRequests: number;
  /** Lockout duration in ms after limit is exceeded (default: 15 min) */
  lockoutMs?:  number;
}

export interface RateLimitResult {
  allowed:    boolean;
  remaining:  number;
  resetAt:    number;
  lockedUntil?: number;
  /** True only on the single call that trips the lockout — used to write one
   *  durable audit row per lockout instead of one per rejected request. */
  justLocked?: boolean;
}

/** Whole seconds until the caller may retry (lockout end, else window end). */
export function retryAfterSeconds(r: RateLimitResult): number {
  const until = r.lockedUntil ?? r.resetAt;
  return Math.max(1, Math.ceil((until - Date.now()) / 1000));
}

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const lockoutMs = opts.lockoutMs ?? 15 * 60 * 1000;

  let w = store.get(key);

  // Locked out?
  if (w?.lockedUntil && w.lockedUntil > now) {
    return { allowed: false, remaining: 0, resetAt: w.resetAt, lockedUntil: w.lockedUntil };
  }

  // Expired window — reset
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + opts.windowMs };
    store.set(key, w);
    evictIfNeeded();
  }

  w.count++;

  if (w.count > opts.maxRequests) {
    // With no lockout the caller is free again when the window rolls over, so
    // `lockedUntil` stays unset and `retryAfterSeconds` falls back to `resetAt`
    // — otherwise it would answer "1 second" while the window still had most of
    // a minute left on it.
    if (lockoutMs > 0) w.lockedUntil = now + lockoutMs;
    store.set(key, w);
    return { allowed: false, remaining: 0, resetAt: w.resetAt, lockedUntil: w.lockedUntil, justLocked: true };
  }

  const remaining = Math.max(0, opts.maxRequests - w.count);
  return { allowed: true, remaining, resetAt: w.resetAt };
}

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
function credentialAttempt(
  scope: string,
  identifier: string,
  ip: string,
  account: RateLimitOptions,
  address: RateLimitOptions,
): CredentialAttempt {
  const acct = checkRateLimit(`${scope}_acct:${accountKey(identifier)}`, account);
  if (!acct.allowed) return { result: acct, limitedBy: "account" };

  const addr = checkRateLimit(`${scope}_ip:${ip}`, address);
  if (!addr.allowed) return { result: addr, limitedBy: "address" };

  return { result: addr, limitedBy: null };
}

/**
 * Staff sign-in. Five tries against one email, then that email waits a quarter
 * of an hour; the address gets a much looser ceiling and is never locked.
 */
export function adminLoginAttempt(email: string, ip: string): CredentialAttempt {
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
export function userLoginAttempt(identifier: string, ip: string): CredentialAttempt {
  return credentialAttempt("user_login", identifier, ip,
    { windowMs: 15 * 60 * 1000, maxRequests: 10,  lockoutMs: 10 * 60 * 1000 },
    { windowMs: 15 * 60 * 1000, maxRequests: 150, lockoutMs: 0 },
  );
}

/** Clear an account's failures after it signs in successfully. */
export function resetAccountAttempts(scope: string, identifier: string): void {
  store.delete(`${scope}_acct:${accountKey(identifier)}`);
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
export function adminApiRateLimit(ip: string): RateLimitResult {
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
export function userApiRateLimit(ip: string): RateLimitResult {
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
export function registrationRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`register:${ip}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 40,
    lockoutMs:   0,
  });
}

/** OTP send — per phone: 3 per 10 min, 10 min lockout (SMS costs money and
 *  spamming a number is abuse). Verify is limited separately per phone. */
export function otpSendRateLimit(phone: string): RateLimitResult {
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
export function otpSendIpRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`otp_send_ip:${ip}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 40,
    lockoutMs:   0,
  });
}

/** OTP verify — per phone: 10 attempts per 10 min (the code itself is also
 *  attempt-capped at 5; this stops brute-forcing across fresh codes). */
export function otpVerifyRateLimit(phone: string): RateLimitResult {
  return checkRateLimit(`otp_verify:${phone}`, {
    windowMs:    10 * 60 * 1000,
    maxRequests: 10,
    lockoutMs:   10 * 60 * 1000,
  });
}

/**
 * Public API rate limit — applied to /api/billboards to slow automated
 * crawling. Normal browser usage never comes close to this ceiling.
 */
export function publicApiRateLimit(ip: string): RateLimitResult {
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
