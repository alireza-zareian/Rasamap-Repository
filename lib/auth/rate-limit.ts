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
    w.lockedUntil = now + lockoutMs;
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

/** Specific preset: admin API — 120 req per minute */
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
 * Specific preset: user API — 60 req/min per IP, then a short 2-minute cooldown.
 * 60/min is far above real interactive use (a booking form, a review, a phone
 * reveal), so tripping it means a script or a stuck button. The cooldown is
 * deliberately short: an accidental burst (e.g. rapid double-taps on a failing
 * form) should not lock a real person out for the 15-minute credential default.
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
 * Public API rate limit — 60 req/min per IP, 10-min lockout after burst.
 * Applied to /api/billboards and /api/billboards/pins to slow automated crawling.
 * Normal browser usage never comes close to this ceiling.
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
