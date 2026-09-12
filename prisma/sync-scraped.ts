// ============================================================
// RASAMAP — Scraped-data sync
//
// The crawler writes scraper/data/billboards.json; this brings that file into
// the database. Until now the only path from one to the other was the seed,
// which is a full rebuild: it cannot run on a live database without throwing
// away every admin edit, every review and every submitted listing along with
// the stale rows. So in practice the data was collected once and then frozen,
// while the product claims to be a single up-to-date view.
//
// The hard part is not the schedule. It is that a row has two authors — the
// feed and the admin who corrected it — and a nightly import that simply writes
// the feed's values would silently undo the corrections, which is worse than
// stale data because nobody sees it happen.
//
// So each row keeps a snapshot of what the feed last said (`sourceSnapshot`),
// and every field is decided by three values rather than two:
//
//   row == snapshot   → nobody has touched it since the last sync; the feed
//                       may write, and only if it actually changed something
//   row != snapshot   → an admin edited this field; the feed never overwrites
//                       it again
//
// A row with no snapshot yet (everything seeded before this script existed) is
// *adopted*: the snapshot is recorded and nothing is written. Without a
// snapshot there is no way to tell an admin's correction from the feed's own
// value, and guessing wrong would erase the correction.
//
// Rows that stop appearing in the feed are marked with `missingSince`, never
// deleted — reviews, contact requests and submitted listings reference them.
//
// The same argument applies in the other direction. A row the feed has and the
// database does not may be new, or it may be one somebody removed on purpose —
// a duplicate `db:dedupe` merged away, a scraped row an admin deleted. Those
// decisions are written down in `source_tombstones`, and a tombstoned slug is
// never re-inserted. On the very first sync of an existing database there is no
// such record to read, so an absence found then is adopted as a tombstone
// rather than guessed at: the run reports how many, and `--insert-absent` adds
// them instead if that database really is just behind.
//
// SAFE BY DEFAULT: with no flags it only reports what it would do.
//
// Usage:
//   npm run db:sync-scraped                     (dry run — changes nothing)
//   npm run db:sync-scraped -- --apply          (write)
//   npm run db:sync-scraped -- --feed=<path>    (read another export)
// ============================================================

import "dotenv/config";
import { readFileSync } from "fs";
import path from "path";
import { PrismaClient, Prisma, type Billboard as Row } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");
const INSERT_ABSENT = process.argv.includes("--insert-absent");
// The crawler's own output, unless another export is named — the tests point
// this at a fixture so they can describe a feed that changed.
const FEED_FLAG = process.argv.find(a => a.startsWith("--feed="))?.slice("--feed=".length);
const FEED = FEED_FLAG
  ? path.resolve(FEED_FLAG)
  : path.join(process.cwd(), "scraper", "data", "billboards.json");

/**
 * The columns the feed owns.
 *
 * Deliberately absent:
 *   slug          — the key rows are matched on; changing it would orphan them
 *   rating,
 *   reviewCount   — recomputed from the reviews table since the 2026-09-02
 *                   review. The crawler still invents both for a brand-new
 *                   row, but once the row exists the database is the authority
 *                   and a sync must not push invented numbers over real ones
 *   status        — see BLOCKED_WHEN_CLAIMED below
 *   scrapedAt     — it changes on every crawl by definition, so treating it as
 *                   a field would mark all 3.5k rows changed every night. It
 *                   rides along only on rows that changed for another reason
 *   plan,
 *   featured      — monetisation state, owned by the admin panel alone
 */
const SYNCED_FIELDS = [
  "name", "location", "region", "city", "type",
  "width", "height", "faces", "age",
  "price", "priceWeekly", "priceQuarterly", "priceYearly",
  "traffic", "mapX", "mapY", "lat", "lng",
  "icon", "images", "agency", "phone", "description",
  "features", "nearbyLandmarks", "url", "structureCode",
] as const;

type SyncedField = (typeof SYNCED_FIELDS)[number];

/** A row of the feed, in the shape prisma/seed.ts already maps. */
interface FeedRow {
  id: number;
  slug: string;
  source?: string;
  scrapedAt?: string;
  status?: string;
  [field: string]: unknown;
}

/**
 * Status is the one field where "the admin edited it" is not the only reason
 * the database may be ahead of the feed.
 *
 * A listing the admin took off the site (`inactive`), or one the submission
 * pipeline owns (`pending`, `rejected`, …), must not be quietly republished
 * because the feed still reports it as available. Those states are decisions
 * about the row, not descriptions of it, so the feed cannot move a row out of
 * one — while `available` ⇄ `busy`, which is a description, it can.
 */
const BLOCKED_WHEN_CLAIMED = ["pending", "awaiting_payment", "rejected", "needs_revision", "inactive", "reserved"];

/** Compare the way the database stores it — JSON columns come back as objects. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/** The feed's value for a field, normalised to what the column holds. */
function feedValue(feed: FeedRow, field: SyncedField): unknown {
  const v = feed[field];
  if (v === undefined) return null;
  return v;
}

interface Decision {
  /** Fields the feed changed and is allowed to write. */
  writes: Partial<Record<SyncedField, unknown>>;
  /** Fields the feed changed but an admin owns — reported, never written. */
  protectedFields: SyncedField[];
}

/**
 * The three-way merge, for one row.
 *
 * `snapshot` is what the feed said last time. Its absence means this row has
 * never been synced, and the caller adopts it instead of writing.
 */
export function decide(row: Row, feed: FeedRow, snapshot: Record<string, unknown>): Decision {
  const writes: Partial<Record<SyncedField, unknown>> = {};
  const protectedFields: SyncedField[] = [];

  for (const field of SYNCED_FIELDS) {
    const now = feedValue(feed, field);
    const then = snapshot[field] ?? null;
    if (same(now, then)) continue;              // the feed did not change it

    if (same((row as unknown as Record<string, unknown>)[field] ?? null, then)) {
      writes[field] = now;                      // untouched since last sync
    } else {
      protectedFields.push(field);              // an admin's value lives here
    }
  }

  return { writes, protectedFields };
}

/** Status moves under its own rule — see BLOCKED_WHEN_CLAIMED. */
function statusWrite(row: Row, feed: FeedRow): string | null {
  const next = typeof feed.status === "string" ? feed.status : null;
  if (!next || next === row.status) return null;
  if (BLOCKED_WHEN_CLAIMED.includes(row.status)) return null;
  return next;
}

function snapshotOf(feed: FeedRow): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const field of SYNCED_FIELDS) snap[field] = feedValue(feed, field);
  return snap;
}

async function main() {
  const feedRows = JSON.parse(readFileSync(FEED, "utf8")) as FeedRow[];
  if (feedRows.length === 0) {
    throw new Error("the feed is empty — refusing to run, since that would mark every row missing");
  }
  const bySlug = new Map(feedRows.map(r => [r.slug, r]));
  if (bySlug.size !== feedRows.length) {
    throw new Error(`the feed repeats a slug: ${feedRows.length} rows, ${bySlug.size} distinct`);
  }

  // Which rows this run is allowed to touch: the ones whose source appears in
  // the feed itself.
  //
  // Naming the crawler's sources here would have been the obvious thing and the
  // wrong one. A row created in the admin panel carries source "manual" and a
  // submitted listing carries "listing"; neither is ever in a feed, so an
  // "everything except listing" rule quietly adopted every admin-created row
  // and marked it missing on the first run — which is how this test suite found
  // it. Reading the sources out of the feed also means a crawl that returns
  // nothing for one site cannot mark that site's whole inventory as vanished:
  // the source is simply not managed that night.
  const feedSources = [...new Set(feedRows.map(r => r.source).filter((s): s is string => Boolean(s)))];
  if (feedSources.length === 0) {
    throw new Error("the feed names no source — refusing to run rather than guess which rows it covers");
  }
  const existing = await prisma.billboard.findMany({ where: { source: { in: feedSources } } });
  const dbBySlug = new Map(existing.map(r => [r.slug, r]));

  const tombstoned = new Set(
    (await prisma.sourceTombstone.findMany({ select: { slug: true } })).map(t => t.slug),
  );

  // A database that already holds crawler rows but has no snapshot on any of
  // them has never been through this script, so the rows it is missing are its
  // own history rather than the feed's news. A database with no crawler rows at
  // all — a fresh install, a restored-from-empty — has no history to protect
  // and takes the whole feed.
  const firstSync = existing.length > 0 && existing.every(r => r.sourceSnapshot === null);

  const counts = { adopted: 0, updated: 0, unchanged: 0, inserted: 0, marked: 0, returned: 0, refused: 0, entombed: 0 };
  const newTombstones: string[] = [];
  const protectedByField = new Map<string, number>();
  const changedByField = new Map<string, number>();

  for (const [slug, feed] of bySlug) {
    const row = dbBySlug.get(slug);

    if (!row) {
      if (tombstoned.has(slug)) {
        counts.refused += 1;          // removed on purpose; it does not come back
      } else if (firstSync && !INSERT_ABSENT) {
        counts.entombed += 1;
        newTombstones.push(slug);
      } else {
        counts.inserted += 1;
        if (APPLY) await insert(feed);
      }
      continue;
    }

    const snapshot = (row.sourceSnapshot ?? null) as Record<string, unknown> | null;

    if (snapshot === null) {
      // First sight: record what the feed says and write nothing.
      counts.adopted += 1;
      if (APPLY) {
        await prisma.billboard.update({
          where: { id: row.id },
          data: { sourceSnapshot: snapshotOf(feed) as Prisma.InputJsonValue, missingSince: null },
        });
      }
      continue;
    }

    const { writes, protectedFields } = decide(row, feed, snapshot);
    const nextStatus = statusWrite(row, feed);
    for (const f of protectedFields) protectedByField.set(f, (protectedByField.get(f) ?? 0) + 1);
    for (const f of Object.keys(writes)) changedByField.set(f, (changedByField.get(f) ?? 0) + 1);

    const returning = row.missingSince !== null;
    if (returning) counts.returned += 1;

    if (Object.keys(writes).length === 0 && !nextStatus && !returning) {
      // Nothing to write, so the row is not touched at all — not even to
      // advance its snapshot. Prisma stamps `updatedAt` on any update, and a
      // nightly run that stamped 3.5k rows would invalidate the catalogue cache
      // every night for no change anybody could see.
      //
      // A row whose only difference is an admin's correction therefore keeps
      // its old snapshot and is reported again on the next run. That is the
      // more useful behaviour: the "fields an admin owns" line below is then a
      // standing list of where this site and its source disagree, rather than a
      // one-night notice that scrolls past.
      counts.unchanged += 1;
      continue;
    }

    counts.updated += 1;
    if (APPLY) {
      await prisma.billboard.update({
        where: { id: row.id },
        data: {
          ...(writes as Prisma.BillboardUpdateInput),
          ...(nextStatus ? { status: nextStatus } : {}),
          // Denormalised sort keys, recomputed only when their inputs moved —
          // the same rule updateBillboard() follows.
          ...(writes.width !== undefined || writes.height !== undefined
            ? { area: Math.round(Number(writes.width ?? row.width) * Number(writes.height ?? row.height)) }
            : {}),
          ...(writes.traffic !== undefined
            ? { estimatedViews: Number((writes.traffic as { estimatedViews?: number })?.estimatedViews ?? 0) }
            : {}),
          ...(writes.images !== undefined
            ? { hasImages: Array.isArray(writes.images) && writes.images.length > 0 }
            : {}),
          scrapedAt: feed.scrapedAt ?? row.scrapedAt,
          missingSince: null,
          sourceSnapshot: snapshotOf(feed) as Prisma.InputJsonValue,
        },
      });
    }
  }

  if (APPLY && newTombstones.length > 0) {
    await prisma.sourceTombstone.createMany({
      data: newTombstones.map(slug => ({ slug, reason: "first_sync" })),
    });
  }

  // Gone from the feed. Marked once, on the run that first misses it.
  const vanished = existing.filter(r => !bySlug.has(r.slug) && r.missingSince === null);
  counts.marked = vanished.length;
  if (APPLY && vanished.length > 0) {
    await prisma.billboard.updateMany({
      where: { id: { in: vanished.map(r => r.id) } },
      data: { missingSince: new Date() },
    });
  }

  report(counts, changedByField, protectedByField, feedRows.length, existing.length);
}

/** A row the feed has but the database does not. */
async function insert(feed: FeedRow) {
  const width = Number(feed.width ?? 0);
  const height = Number(feed.height ?? 0);
  const traffic = (feed.traffic ?? {}) as { estimatedViews?: number };
  const images = Array.isArray(feed.images) ? (feed.images as string[]) : [];

  await prisma.billboard.create({
    data: {
      // The crawler's id is a stable hash of the listing's own id, so it is
      // kept when it is free and let go when it is not — a collision must not
      // fail the whole run.
      ...((await prisma.billboard.findUnique({ where: { id: feed.id }, select: { id: true } })) ? {} : { id: feed.id }),
      name: String(feed.name ?? ""),
      slug: feed.slug,
      location: String(feed.location ?? ""),
      region: String(feed.region ?? ""),
      city: String(feed.city ?? ""),
      type: String(feed.type ?? "billboard"),
      status: String(feed.status ?? "available"),
      width, height,
      area: Math.round(width * height),
      faces: Number(feed.faces ?? 1),
      age: Number(feed.age ?? 1),
      price: Number(feed.price ?? 0),
      priceWeekly: Number(feed.priceWeekly ?? 0),
      priceQuarterly: Number(feed.priceQuarterly ?? 0),
      priceYearly: Number(feed.priceYearly ?? 0),
      traffic: traffic as Prisma.InputJsonValue,
      estimatedViews: Number(traffic.estimatedViews ?? 0),
      mapX: Number(feed.mapX ?? 0),
      mapY: Number(feed.mapY ?? 0),
      lat: feed.lat === undefined ? null : Number(feed.lat),
      lng: feed.lng === undefined ? null : Number(feed.lng),
      icon: String(feed.icon ?? "📋"),
      hasImages: images.length > 0,
      images: images as Prisma.InputJsonValue,
      agency: String(feed.agency ?? ""),
      phone: String(feed.phone ?? "—"),
      description: String(feed.description ?? ""),
      features: (feed.features ?? []) as Prisma.InputJsonValue,
      nearbyLandmarks: (feed.nearbyLandmarks ?? []) as Prisma.InputJsonValue,
      // Invented by the crawler for a new row and never synced afterwards —
      // once the row exists these come from the reviews table.
      rating: Number(feed.rating ?? 0),
      reviewCount: Number(feed.reviewCount ?? 0),
      url: feed.url === undefined ? null : String(feed.url),
      source: feed.source ?? null,
      structureCode: feed.structureCode === undefined ? null : String(feed.structureCode),
      scrapedAt: feed.scrapedAt ?? null,
      sourceSnapshot: snapshotOf(feed) as Prisma.InputJsonValue,
    },
  });
}

function report(
  counts: Record<string, number>,
  changed: Map<string, number>,
  protectedFields: Map<string, number>,
  feedSize: number,
  dbSize: number,
) {
  const byCount = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f}×${n}`).join(", ") || "none";

  console.log(`\nfeed ${feedSize} rows · database ${dbSize} rows from the same sources`);
  console.log(`  adopted (first sync, nothing written) : ${counts.adopted}`);
  console.log(`  inserted (new in the feed)            : ${counts.inserted}`);
  console.log(`  refused (tombstoned — removed on purpose) : ${counts.refused}`);
  console.log(`  absent at first sync, recorded as such : ${counts.entombed}`);
  console.log(`  updated                               : ${counts.updated}`);
  console.log(`  unchanged                             : ${counts.unchanged}`);
  console.log(`  marked missing                        : ${counts.marked}`);
  console.log(`  back after being missing              : ${counts.returned}`);
  console.log(`  fields written    : ${byCount(changed)}`);
  console.log(`  fields an admin owns, left alone : ${byCount(protectedFields)}`);
  if (counts.entombed > 0) {
    console.log(
      `\n  ${counts.entombed} row(s) the feed has and this database does not were recorded as\n` +
      "  deliberately absent, because this is its first sync and there is no way to\n" +
      "  tell a deletion from a gap. Re-run with --insert-absent to add them instead.",
    );
  }
  console.log(APPLY ? "\nwritten.\n" : "\ndry run — nothing was written. Pass --apply to write.\n");
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
