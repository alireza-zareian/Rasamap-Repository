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

/** Specific preset: login endpoint — 5 attempts per 15 min, 15 min lockout */
export function loginRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`login:${ip}`, {
    windowMs:    15 * 60 * 1000,
    maxRequests: 5,
    lockoutMs:   15 * 60 * 1000,
  });
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

/** Reset login attempts (on success) */
export function resetLoginAttempts(ip: string): void {
  store.delete(`login:${ip}`);
}

/** Specific preset: user login — 10 attempts per 15 min, 15 min lockout */
export function userLoginRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`user_login:${ip}`, {
    windowMs:    15 * 60 * 1000,
    maxRequests: 10,
    lockoutMs:   15 * 60 * 1000,
  });
}

export function resetUserLoginAttempts(ip: string): void {
  store.delete(`user_login:${ip}`);
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

/** Specific preset: registration — 5 attempts per hour, 1 hour lockout */
export function registrationRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`register:${ip}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 5,
    lockoutMs:   60 * 60 * 1000,
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

/** OTP send — per IP: 10 per hour, so one client can't fan out across numbers. */
export function otpSendIpRateLimit(ip: string): RateLimitResult {
  return checkRateLimit(`otp_send_ip:${ip}`, {
    windowMs:    60 * 60 * 1000,
    maxRequests: 10,
    lockoutMs:   30 * 60 * 1000,
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
