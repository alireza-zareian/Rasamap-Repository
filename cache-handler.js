// ============================================================================
// RASAMAP — Redis-backed Next.js cache handler
//
// Where the server keeps what it has already worked out: the rendered landing
// page, and every cached catalogue query from lib/db/cached.ts.
//
// Without this, that store is a directory under .next/cache. That is right for
// one process on one laptop and wrong for anything else: a second instance
// cannot see the first one's entries, a redeploy starts cold, and — the part
// that actually breaks — an admin approving a listing on instance A clears A's
// copy while instance B keeps serving the old catalogue until it expires on
// its own.
//
// DORMANT BY DEFAULT. next.config.ts only names this file when REDIS_URL is
// set; with no REDIS_URL none of this is loaded and Next.js uses its own cache.
// Same shape as the SMS layer in §16 of docs/engineering-decisions.md — written
// and tested, switched on by an environment variable, not by a code change.
//
// ── Two tiers, and why ──────────────────────────────────────────────────────
// Measured on the demo laptop: routing every read through Redis over loopback
// made the landing page 1.9 ms → 6.2 ms per visit, because a page that used to
// be handed over from memory now costs a round-trip. A shared cache that is
// three times slower than the thing it replaces is not a foundation.
//
// So each process keeps a small in-memory tier in front of Redis, and
// invalidations are PUBLISHed on a channel that every instance subscribes to.
// An admin's write therefore clears Redis *and* every instance's memory, which
// is the correctness the single-tier version was buying at that price.
//
// Run it locally with:
//   brew services start redis     (or: redis-server --daemonize yes)
//   REDIS_URL=redis://127.0.0.1:6379 npm run demo
// ============================================================================

const { createClient } = require("redis");

/** Prefix on every key, so one Redis can host more than this app. */
const PREFIX = process.env.REDIS_PREFIX || "rasamap:cache:";
const entryKey = (key) => `${PREFIX}entry:${key}`;
/** The Redis set naming which entries carry a given tag. */
const tagKey = (tag) => `${PREFIX}tag:${tag}`;
/** Where instances tell each other that a tag has been invalidated. */
const INVALIDATION_CHANNEL = `${PREFIX}invalidate`;

/**
 * A ceiling on how long an entry may sit in Redis. Next decides real expiry
 * from each entry's own revalidate time; this only stops keys from a long-dead
 * build accumulating in a Redis nobody prunes.
 */
const MAX_TTL_SECONDS = 60 * 60 * 24;

/** Entries held in this process. Bounded so a crawler cannot grow it forever. */
const LOCAL_MAX_ENTRIES = 512;

// ── Process-wide state ──────────────────────────────────────────────────────
// Module scope, not instance scope: Next constructs the handler more than once,
// and a memory tier that is not shared between those copies caches nothing.

/** key → entry. Insertion-ordered, which is what makes the eviction below LRU. */
const local = new Map();
/** tag → Set(key), so a published invalidation can find what to drop locally. */
const localTags = new Map();

let clientPromise = null;
let subscriberStarted = false;

function rememberLocally(key, entry) {
  // Re-inserting moves the key to the end of the Map's order, so the key
  // evicted below is genuinely the least recently used one.
  local.delete(key);
  local.set(key, entry);
  for (const tag of entry.tags ?? []) {
    if (!localTags.has(tag)) localTags.set(tag, new Set());
    localTags.get(tag).add(key);
  }
  while (local.size > LOCAL_MAX_ENTRIES) {
    const oldest = local.keys().next().value;
    forgetLocally(oldest);
  }
}

function forgetLocally(key) {
  const entry = local.get(key);
  if (entry) {
    for (const tag of entry.tags ?? []) localTags.get(tag)?.delete(key);
  }
  local.delete(key);
}

function forgetTagLocally(tag) {
  for (const key of localTags.get(tag) ?? []) local.delete(key);
  localTags.delete(tag);
}

/**
 * One lazily-created connection per process.
 *
 * Every failure path returns null rather than throwing. A cache is an
 * optimisation: if Redis is unreachable the right behaviour is to render the
 * page — slower, but correct — not to serve an error. The failure is logged
 * once per connection, not once per request, so an outage does not also become
 * a log flood.
 */
function getClient() {
  if (clientPromise) return clientPromise;

  const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
      // Give up rather than queue commands behind a dead server: the request
      // waiting on this has a page to render.
      connectTimeout: 1000,
      reconnectStrategy: (retries) => (retries > 10 ? false : Math.min(retries * 100, 2000)),
    },
  });

  client.on("error", (err) => {
    if (!client.loggedError) {
      client.loggedError = true;
      console.error("[cache-handler] Redis unavailable, serving uncached:", err.message);
    }
  });
  client.on("ready", () => { client.loggedError = false; });

  clientPromise = client
    .connect()
    .then((c) => { startSubscriber(); return c; })
    .catch(() => null);
  return clientPromise;
}

/**
 * Listen for invalidations published by any instance, including this one.
 *
 * This is what lets the memory tier exist. Without it, instance B would keep
 * answering from memory with a catalogue instance A has already corrected.
 * Subscribing needs its own connection — a Redis client in subscriber mode
 * cannot run ordinary commands.
 */
function startSubscriber() {
  if (subscriberStarted) return;
  subscriberStarted = true;

  const sub = createClient({ url: process.env.REDIS_URL });
  sub.on("error", () => { /* the tier below is still correct, just colder */ });
  sub
    .connect()
    .then(() => sub.subscribe(INVALIDATION_CHANNEL, (tag) => forgetTagLocally(tag)))
    .catch(() => { subscriberStarted = false; });
}

module.exports = class RedisCacheHandler {
  async get(key) {
    const cached = local.get(key);
    if (cached) return cached;

    const client = await getClient();
    if (!client) return null;

    let stored;
    try {
      stored = await client.get(entryKey(key));
    } catch {
      return null;
    }
    if (!stored) return null;

    let entry;
    try {
      entry = JSON.parse(stored);
    } catch {
      // A malformed entry is a miss, not a crash: Next writes a fresh one over
      // it on the way back.
      return null;
    }

    rememberLocally(key, entry);
    return entry;
  }

  /**
   * Store an entry and record which tags it carries.
   *
   * The tag sets are what make revalidateTag() possible: without them a tag
   * would have to be found by scanning every key, which is the one operation a
   * shared Redis must never be asked to do.
   */
  async set(key, data, ctx) {
    const entry = { value: data, lastModified: Date.now(), tags: ctx?.tags ?? [] };
    rememberLocally(key, entry);

    const client = await getClient();
    if (!client) return;

    try {
      const multi = client.multi();
      multi.set(entryKey(key), JSON.stringify(entry), { EX: MAX_TTL_SECONDS });
      for (const tag of entry.tags) {
        multi.sAdd(tagKey(tag), key);
        multi.expire(tagKey(tag), MAX_TTL_SECONDS);
      }
      await multi.exec();
    } catch {
      // Failing to write the shared copy costs a re-render on another instance.
      // Nothing else — this process still has it in memory.
    }
  }

  /**
   * Drop every entry carrying any of these tags, everywhere.
   *
   * This is the method that earns the file. It runs on whichever instance
   * handled the write; the PUBLISH is what carries the news to the others.
   */
  async revalidateTag(tags) {
    const list = Array.isArray(tags) ? tags : [tags];
    if (list.length === 0) return;

    for (const tag of list) forgetTagLocally(tag);

    const client = await getClient();
    if (!client) return;

    try {
      for (const tag of list) {
        const keys = await client.sMembers(tagKey(tag));
        const multi = client.multi();
        for (const key of keys) multi.del(entryKey(key));
        multi.del(tagKey(tag));
        multi.publish(INVALIDATION_CHANNEL, tag);
        await multi.exec();
      }
    } catch {
      // Entries keep their own revalidate time, so a failure here delays the
      // update to at most that. It does not strand stale data forever.
    }
  }

  /**
   * Next calls this between requests. The memory tier deliberately survives it:
   * it is invalidated by tag, not by request boundary, which is the whole point
   * of holding it across requests.
   */
  resetRequestCache() {}
};
