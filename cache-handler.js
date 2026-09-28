// A Redis-backed Next.js cache handler (§25), dormant until REDIS_URL is set.
//
// Without it the cache is a directory under .next/cache: right for one
// process, wrong for several — an approval on instance A clears A's copy while
// B keeps serving the old catalogue.
//
// Two tiers: every read through Redis made the landing 1.9 → 6.2 ms, so each
// process keeps a small memory tier in front, and invalidations are PUBLISHed
// to every instance, clearing Redis and every memory tier together.
//
// Locally: redis-server --daemonize yes; REDIS_URL=redis://127.0.0.1:6379 npm run demo

const { createClient } = require("redis");

/** Prefix on every key, so one Redis can host more than this app. */
const PREFIX = process.env.REDIS_PREFIX || "rasamap:cache:";
const entryKey = (key) => `${PREFIX}entry:${key}`;
/** The Redis set naming which entries carry a given tag. */
const tagKey = (tag) => `${PREFIX}tag:${tag}`;
/** Where instances tell each other that a tag has been invalidated. */
const INVALIDATION_CHANNEL = `${PREFIX}invalidate`;

/** A ceiling in Redis; real expiry is each entry's revalidate time. Stops dead builds' keys piling up. */
const MAX_TTL_SECONDS = 60 * 60 * 24;

/** Entries held in this process. Bounded so a crawler cannot grow it forever. */
const LOCAL_MAX_ENTRIES = 512;

// ── Process-wide state ──────────────────────────────────────────────────────
// Module scope: Next constructs the handler more than once.

/** key → entry. Insertion-ordered, which is what makes the eviction below LRU. */
const local = new Map();
/** tag → Set(key), so a published invalidation can find what to drop locally. */
const localTags = new Map();

let clientPromise = null;
let subscriberStarted = false;

function rememberLocally(key, entry) {
  // Re-inserting moves the key to the end, so eviction is least-recently-used.
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
 * One lazy connection per process. Failure returns null, never throws: without
 * Redis the page renders, slower but correct. Logged once, not per request.
 */
function getClient() {
  if (clientPromise) return clientPromise;

  const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
      // Fail fast: a page is waiting to render.
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
 * Listen for invalidations from every instance, this one included — what makes
 * the memory tier safe. A subscriber needs its own connection.
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
      // A malformed entry is a miss; Next writes a fresh one.
      return null;
    }

    rememberLocally(key, entry);
    return entry;
  }

  /** Store an entry and index its tags, so revalidateTag() never scans every key. */
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
      // Costs another instance a re-render; this one still has it in memory.
    }
  }

  /** Drop every entry with any of these tags, everywhere; the PUBLISH tells the other instances. */
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
      // A failure delays the update to at most the entries' revalidate time.
    }
  }

  /** Called between requests; the memory tier outlives it — it is invalidated by tag. */
  resetRequestCache() {}
};
