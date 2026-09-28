import "server-only";
import { createClient } from "redis";
import { logger } from "@/lib/logger";

/**
 * Where rate-limit counters live: in memory for one process, in Redis when
 * REDIS_URL is set — otherwise three instances would allow three times the
 * guesses. The response cache follows the same switch (§25).
 *
 * One fixed-window-with-lockout algorithm, in TypeScript and in Lua. The Lua
 * runs as one Redis script, atomic across instances; the memory version has no
 * await between read and write, so it is atomic on Node's one thread.
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
  /** True only on the call that first crosses the limit: one audit row per lockout, not per 429. */
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

// A cap on tracked keys. What goes first at the cap matters: evicting by age
// let ~50 000 made-up sign-ins push a locked account out of the Map, lock and
// all. So expired windows go first, then unlocked ones, and a live lockout only
// if nothing else is left.
const MAX_KEYS = 50_000;
const TRIM = 1000; // a slab at once, not one key per insert

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

  // Sweep expired entries; unref() so the sweeper alone does not keep the process alive.
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
        // Without a lockout, `lockedUntil` stays unset so Retry-After is the window's end.
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
 * The memory store's `hit` as one atomic Redis script, on Redis's own clock so
 * instances agree on when a window ends. The key expires with the later of its
 * window and its lockout.
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
 * Redis, falling back to the memory store while Redis is unreachable: limits
 * stay enforced per instance during an outage, and the site stays up.
 */
export function createRedisStore(url: string, fallback: RateLimitStore): RateLimitStore {
  let warned = false;
  const client = createClient({
    url,
    socket: {
      // A sign-in waits on this: fail fast rather than queue behind a dead server.
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
  // Not awaited: with reconnects, connect() stays pending through an outage.
  // Each call checks whether the link is up now instead.
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
