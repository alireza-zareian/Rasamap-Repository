import "server-only";
import { createClient } from "redis";
import { logger } from "@/lib/logger";

/**
 * Where rate-limit counters live.
 *
 * One process keeps them in memory. Several processes must share them, or each
 * instance hands out its own budget and three instances mean three times the
 * password guesses before a lockout. The response cache already follows
 * REDIS_URL for the same reason (cache-handler.js, §25); the counters follow the
 * same switch, so turning on a shared store turns on *all* of it rather than
 * half — which is what used to be the case.
 *
 * Both stores implement one fixed-window-with-lockout algorithm, spelled once in
 * TypeScript and once in Lua. The Lua version runs inside Redis as a single
 * script, so the read-increment-write is atomic across instances; the memory
 * version is atomic because Node runs it on one thread.
 */

export interface RateLimitOptions {
  /** Window duration in milliseconds */
  windowMs:    number;
  /** Max requests allowed within the window */
  maxRequests: number;
  /** Lockout duration in ms once the limit is exceeded; 0 means none. */
  lockoutMs:   number;
}

export interface RateLimitResult {
  allowed:    boolean;
  remaining:  number;
  resetAt:    number;
  lockedUntil?: number;
  /**
   * True only on the single call that first crosses the limit. The 429 helper
   * writes one durable audit row on it instead of one per rejected request, so
   * a burst cannot flood the audit table.
   */
  justLocked?: boolean;
}

export interface RateLimitStore {
  hit(key: string, opts: RateLimitOptions): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

// ── Memory ──────────────────────────────────────────────────────────────────

interface Window {
  count:     number;
  resetAt:   number;
  lockedUntil?: number;
}

// Hard cap on tracked keys, so a flood of distinct keys cannot grow this Map
// without bound.
//
// What gets dropped at the cap matters. Dropping plainly by age let the flood
// itself erase a lockout: every sign-in attempt with a made-up identifier
// inserts an account key, so ~50 000 cheap requests pushed the key of the
// account under attack out of the Map, and with it the lock — five fresh
// guesses. So expired windows go first, then the oldest *unlocked* ones, and a
// live lockout is dropped only if nothing else is left.
const MAX_KEYS = 50_000;
const TRIM = 1000; // trim a slab at once, not one key per insert

export function createMemoryStore(): RateLimitStore {
  const windows = new Map<string, Window>();

  const evictIfNeeded = () => {
    if (windows.size <= MAX_KEYS) return;
    const now = Date.now();
    const target = MAX_KEYS - TRIM;
    const locked = (w: Window) => w.lockedUntil !== undefined && w.lockedUntil > now;

    for (const [key, w] of windows) {
      if (w.resetAt <= now && !locked(w)) windows.delete(key);
    }
    for (const [key, w] of windows) {
      if (windows.size <= target) return;
      if (!locked(w)) windows.delete(key);
    }
    for (const key of windows.keys()) {
      if (windows.size <= target) return;
      windows.delete(key);
    }
  };

  // Clean expired entries every 5 minutes. unref(): the sweeper alone must not
  // keep the process alive.
  setInterval(() => {
    const now = Date.now();
    for (const [key, w] of windows) {
      if (w.resetAt < now && (!w.lockedUntil || w.lockedUntil < now)) windows.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();

  return {
    async hit(key, { windowMs, maxRequests, lockoutMs }) {
      const now = Date.now();
      let w = windows.get(key);

      if (w?.lockedUntil && w.lockedUntil > now) {
        return { allowed: false, remaining: 0, resetAt: w.resetAt, lockedUntil: w.lockedUntil };
      }
      if (!w || w.resetAt <= now) {
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
        evictIfNeeded();
      }

      w.count++;
      if (w.count > maxRequests) {
        // With no lockout the caller is free again when the window rolls over,
        // so `lockedUntil` stays unset and the retry time falls back to
        // `resetAt` — otherwise it would answer "1 second" while the window
        // still had most of a minute left on it.
        if (lockoutMs > 0) w.lockedUntil = now + lockoutMs;
        return {
          allowed: false, remaining: 0, resetAt: w.resetAt, lockedUntil: w.lockedUntil,
          justLocked: w.count === maxRequests + 1,
        };
      }
      return { allowed: true, remaining: maxRequests - w.count, resetAt: w.resetAt };
    },

    async reset(key) {
      windows.delete(key);
    },
  };
}

// ── Redis ───────────────────────────────────────────────────────────────────

/**
 * The memory store's `hit`, as one atomic Redis script. The clock is Redis's
 * own (TIME), so instances with slightly different clocks still agree on when
 * a window ends. The key expires with the later of its window and its lockout,
 * so Redis prunes what the memory store's sweeper prunes.
 *
 * Returns {allowed, remaining, resetAt, lockedUntil or -1, justLocked}.
 */
const HIT_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local windowMs, maxRequests, lockoutMs = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])

local v = redis.call('HMGET', KEYS[1], 'count', 'resetAt', 'lockedUntil')
local count, resetAt, lockedUntil = tonumber(v[1]), tonumber(v[2]), tonumber(v[3])

if lockedUntil and lockedUntil > now then
  return {0, 0, resetAt, lockedUntil, 0}
end
if (not resetAt) or resetAt <= now then
  count, resetAt, lockedUntil = 0, now + windowMs, nil
  redis.call('DEL', KEYS[1])
end

count = count + 1
local justLocked = 0
if count > maxRequests then
  if lockoutMs > 0 then lockedUntil = now + lockoutMs end
  if count == maxRequests + 1 then justLocked = 1 end
end

redis.call('HSET', KEYS[1], 'count', count, 'resetAt', resetAt)
if lockedUntil then redis.call('HSET', KEYS[1], 'lockedUntil', lockedUntil) end
redis.call('PEXPIREAT', KEYS[1], math.max(resetAt, lockedUntil or 0))

if count > maxRequests then
  return {0, 0, resetAt, lockedUntil or -1, justLocked}
end
return {1, maxRequests - count, resetAt, -1, 0}
`;

const KEY_PREFIX = `${process.env.REDIS_PREFIX || "rasamap:"}ratelimit:`;

/**
 * A Redis-backed store that falls back to a memory store while Redis cannot be
 * reached. Failing open to memory — not failing closed, not skipping the check
 * — keeps every limit enforced per instance during an outage: the site stays
 * up, and the worst case is the one-process behaviour this replaces.
 */
export function createRedisStore(url: string, fallback: RateLimitStore): RateLimitStore {
  let warned = false;
  const client = createClient({
    url,
    socket: {
      // Give up rather than queue commands behind a dead server: a sign-in is
      // waiting on this answer.
      connectTimeout: 1000,
      reconnectStrategy: retries => Math.min(retries * 200, 5000),
    },
    disableOfflineQueue: true,
  });
  client.on("error", err => {
    if (warned) return;
    warned = true;
    logger.warn("rate-limit: Redis unavailable, limiting per process", { error: String(err?.message ?? err) });
  });
  client.on("ready", () => { warned = false; });
  // Never awaited. With a reconnect strategy, connect() stays pending for as
  // long as Redis is down — a request that waited on it would wait for the
  // outage. Each call asks instead whether the link is up *now*, and uses
  // memory if not.
  client.connect().catch(() => {});

  const usable = () => client.isReady;

  return {
    async hit(key, opts) {
      if (!usable()) return fallback.hit(key, opts);
      try {
        const [allowed, remaining, resetAt, lockedUntil, justLocked] = (await client.eval(HIT_SCRIPT, {
          keys: [KEY_PREFIX + key],
          arguments: [String(opts.windowMs), String(opts.maxRequests), String(opts.lockoutMs)],
        })) as number[];
        return {
          allowed: allowed === 1,
          remaining,
          resetAt,
          ...(lockedUntil > 0 ? { lockedUntil } : {}),
          ...(justLocked === 1 ? { justLocked: true } : {}),
        };
      } catch (err) {
        logger.warn("rate-limit: Redis command failed, limiting per process", { error: String(err) });
        return fallback.hit(key, opts);
      }
    },

    async reset(key) {
      await fallback.reset(key);
      if (!usable()) return;
      try {
        await client.del(KEY_PREFIX + key);
      } catch {
        // A counter that outlives a successful sign-in only costs a retry later.
      }
    },
  };
}
