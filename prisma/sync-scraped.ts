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
// So each row keeps a snapshot of what the feed last said (its
// billboard_sources row's `snapshot`), and every field is decided by three
// values rather than two:
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
// Rows that stop appearing in the feed are marked with `missingSince` (on the
// same billboard_sources row), never deleted — reviews, contact requests and
// submitted listings reference them.
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
import {
  PrismaClient, Prisma, Availability, BillboardType,
  type Billboard, type BillboardSource,
} from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { z } from "zod";
import { StringListSchema, TrafficSchema } from "../lib/domain/billboard";

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
 *   status        — the feed's status is an availability, and moves under its
 *                   own rule: see availabilityWrite below
 *   moderation    — review state is the database's alone; a crawled row is
 *                   approved when it is inserted and the feed never touches it
 *   scrapedAt     — it changes on every crawl by definition, so treating it as
 *                   a field would mark all 3.5k rows changed every night. It
 *                   rides along only on rows that changed for another reason
 *   plan,
 *   featured      — monetisation state, owned by the admin panel alone
 *
 * The feed still carries `icon`, `mapX` and `mapY`; those columns are gone
 * (migration 20260925090000) and the fields are ignored.
 */
const BILLBOARD_FIELDS = [
  "name", "location", "region", "city", "type",
  "width", "height", "faces", "age",
  "price", "priceWeekly", "priceQuarterly", "priceYearly",
  "traffic", "lat", "lng",
  "images", "agency", "phone", "description",
  "features", "nearbyLandmarks",
] as const;

/** The feed's fields that live on the row's billboard_sources record. */
const SOURCE_FIELDS = ["url", "structureCode"] as const;

const SYNCED_FIELDS = [...BILLBOARD_FIELDS, ...SOURCE_FIELDS] as const;

type SyncedField = (typeof SYNCED_FIELDS)[number];

type Row = Billboard & { sourceRecord: BillboardSource | null };

/**
 * What a feed row must look like before any of it is written.
 *
 * The feed is another program's output, and it was read with a bare cast: a
 * value of the wrong type reached Prisma, which threw, and a run with no
 * transaction stopped half-way. It already happens in the real export — ten
 * rows carry a fractional width or height (10.8 × 2.6) for an integer column,
 * one claims 2 040 × 310 metres. Now each row is checked: sizes are rounded to
 * the metre the column holds and bounded like a listing's, coordinates must
 * fall inside Iran, and a photo must be one of the site's own files under
 * /images/ — the admin and listing paths refuse outside addresses, and so does
 * this one. A row that fails is skipped, reported, and still counts as present,
 * so a crawler bug cannot make the importer mark real rows missing.
 */
const Size = z.number().positive().max(200).transform(Math.round).pipe(z.number().int().min(1));
const Money = z.number().int().nonnegative();
const Text = (max: number) => z.string().max(max);

const FeedRowSchema = z.object({
  id:             z.number().int().positive(),
  slug:           z.string().regex(/^[a-z0-9-]+$/).max(120),
  source:         z.string().min(1).optional(),
  scrapedAt:      z.string().optional(),
  status:         z.string().optional(),
  name:           z.string().min(1).max(200),
  location:       Text(500),
  region:         Text(300),
  city:           z.string().min(1).max(100),
  type:           z.string(),
  width:          Size,
  height:         Size,
  faces:          z.number().int().min(1).max(12),
  age:            z.number().int().min(0).max(100),
  price:          Money,
  priceWeekly:    Money,
  priceQuarterly: Money,
  priceYearly:    Money,
  traffic:        TrafficSchema,
  lat:            z.number().min(24).max(40).nullish(),
  lng:            z.number().min(44).max(64).nullish(),
  images:         z.array(z.string().regex(/^\/images\/[A-Za-z0-9._/-]+$/)).max(20),
  agency:         Text(200),
  phone:          Text(50),
  description:    Text(5000),
  features:       StringListSchema,
  nearbyLandmarks: StringListSchema,
  rating:         z.number().min(0).max(5).optional(),
  reviewCount:    z.number().int().nonnegative().optional(),
  url:            z.string().nullish(),
  structureCode:  z.string().nullish(),
}).passthrough();

/** A row of the feed, once it has passed FeedRowSchema. */
type FeedRow = z.infer<typeof FeedRowSchema> & { [field: string]: unknown };

/**
 * Availability is the one field where "the admin edited it" is not the only
 * reason the database may be ahead of the feed.
 *
 * A board an admin took off the site (`inactive`) or marked `reserved` must
 * not be quietly put back because the feed still reports it as available.
 * Those states are decisions about the row, not descriptions of it, so the
 * feed cannot move a row out of one — while `available` ⇄ `busy`, which is a
 * description, it can.
 */
const DECIDED_AVAILABILITY: Availability[] = ["inactive", "reserved"];

/** A feed value, if it is one of the enum's values; otherwise null. */
function asEnum<T extends string>(value: unknown, allowed: Record<string, T>): T | null {
  return typeof value === "string" && (Object.values(allowed) as string[]).includes(value) ? (value as T) : null;
}

/** Compare the way the database stores it — JSON columns come back as objects. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (typeof a === "object" || typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/**
 * The feed's value for a field, normalised to what the column holds. A `type`
 * outside the enum reads as absent rather than failing the whole run on one
 * row — the column cannot hold it anyway.
 */
function feedValue(feed: FeedRow, field: SyncedField): unknown {
  const v = feed[field];
  if (v === undefined) return null;
  if (field === "type") return asEnum(v, BillboardType);
  return v;
}

/** A row's current value for a synced field, wherever that field lives. */
function currentValue(row: Row, field: SyncedField): unknown {
  if ((SOURCE_FIELDS as readonly string[]).includes(field)) {
    return row.sourceRecord?.[field as (typeof SOURCE_FIELDS)[number]] ?? null;
  }
  return (row as unknown as Record<string, unknown>)[field] ?? null;
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

    if (same(currentValue(row, field), then)) {
      writes[field] = now;                      // untouched since last sync
    } else {
      protectedFields.push(field);              // an admin's value lives here
    }
  }

  return { writes, protectedFields };
}

/** Availability moves under its own rule — see DECIDED_AVAILABILITY. */
function availabilityWrite(row: Row, feed: FeedRow): Availability | null {
  const next = asEnum(feed.status, Availability);
  if (!next || next === row.availability) return null;
  if (DECIDED_AVAILABILITY.includes(row.availability)) return null;
  return next;
}

/** Split a set of writes between the billboard and its source record. */
function splitWrites(writes: Partial<Record<SyncedField, unknown>>) {
  const billboard: Record<string, unknown> = {};
  const source: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(writes)) {
    // A type the enum does not know reads as null (see feedValue); the column
    // is required, so the row keeps the type it has.
    if (field === "type" && value === null) continue;
    ((SOURCE_FIELDS as readonly string[]).includes(field) ? source : billboard)[field] = value;
  }
  return { billboard, source };
}

function snapshotOf(feed: FeedRow): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const field of SYNCED_FIELDS) snap[field] = feedValue(feed, field);
  return snap;
}

async function main() {
  const raw: unknown = JSON.parse(readFileSync(FEED, "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("the feed is empty or not a list — refusing to run, since that would mark every row missing");
  }

  // Every slug the feed mentions, readable or not: presence decides what is
  // marked missing, and an unreadable row is still a row the source has.
  const presentSlugs = new Set<string>();
  const feedRows: FeedRow[] = [];
  const invalid: { slug: string; issue: string }[] = [];
  for (const item of raw) {
    const slug = typeof item?.slug === "string" ? item.slug : null;
    if (slug) presentSlugs.add(slug);
    const parsed = FeedRowSchema.safeParse(item);
    if (parsed.success) feedRows.push(parsed.data as FeedRow);
    else invalid.push({ slug: slug ?? "(no slug)", issue: parsed.error.issues.map(i => i.path.join(".")).join(", ") });
  }
  if (presentSlugs.size !== raw.length) {
    throw new Error(`the feed repeats or omits a slug: ${raw.length} rows, ${presentSlugs.size} distinct slugs`);
  }
  const bySlug = new Map(feedRows.map(r => [r.slug, r]));

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
  const existing: Row[] = await prisma.billboard.findMany({
    where:   { source: { in: feedSources } },
    include: { sourceRecord: true },
  });
  const dbBySlug = new Map(existing.map(r => [r.slug, r]));

  const tombstoned = new Set(
    (await prisma.sourceTombstone.findMany({ select: { slug: true } })).map(t => t.slug),
  );

  // A database that already holds crawler rows but has no snapshot on any of
  // them has never been through this script, so the rows it is missing are its
  // own history rather than the feed's news. A database with no crawler rows at
  // all — a fresh install, a restored-from-empty — has no history to protect
  // and takes the whole feed.
  const firstSync = existing.length > 0 && existing.every(r => r.sourceRecord?.snapshot == null);

  const counts = { adopted: 0, updated: 0, unchanged: 0, inserted: 0, marked: 0, returned: 0, refused: 0, entombed: 0, raced: 0 };
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

    const snapshot = (row.sourceRecord?.snapshot ?? null) as Record<string, unknown> | null;

    if (snapshot === null) {
      // First sight: record what the feed says and write nothing.
      counts.adopted += 1;
      if (APPLY) {
        const record = { snapshot: snapshotOf(feed) as Prisma.InputJsonValue, missingSince: null };
        await prisma.billboardSource.upsert({
          where:  { billboardId: row.id },
          create: { billboardId: row.id, ...record },
          update: record,
        });
      }
      continue;
    }

    const { writes, protectedFields } = decide(row, feed, snapshot);
    const nextAvailability = availabilityWrite(row, feed);
    for (const f of protectedFields) protectedByField.set(f, (protectedByField.get(f) ?? 0) + 1);
    for (const f of Object.keys(writes)) changedByField.set(f, (changedByField.get(f) ?? 0) + 1);

    const returning = row.sourceRecord?.missingSince != null;
    if (returning) counts.returned += 1;

    if (Object.keys(writes).length === 0 && !nextAvailability && !returning) {
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

    if (!APPLY) { counts.updated += 1; continue; }

    const split = splitWrites(writes);
    const record = {
      ...split.source,
      scrapedAt: feed.scrapedAt ?? row.sourceRecord?.scrapedAt ?? null,
      missingSince: null,
      snapshot: snapshotOf(feed) as Prisma.InputJsonValue,
    };
    // The merge above decided from the row as it was read at the start of the
    // run. An admin who saves the same row a moment later must not be
    // overwritten by that stale decision, so the write carries the row's
    // updatedAt as a condition and lands only if nobody wrote in between; a
    // row that lost the race is left for the next run to decide again.
    const landed = await prisma.$transaction(async tx => {
      const { count } = await tx.billboard.updateMany({
        where: { id: row.id, updatedAt: row.updatedAt },
        data: {
          // Explicit, because a run that only touches the source record (a row
          // back in the feed) has no billboard field to write, and an empty
          // update reports no row — which would read as a lost race.
          updatedAt: new Date(),
          ...(split.billboard as Prisma.BillboardUpdateManyMutationInput),
          ...(nextAvailability ? { availability: nextAvailability } : {}),
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
        },
      });
      if (count === 0) return false;
      await tx.billboardSource.upsert({
        where:  { billboardId: row.id },
        create: { billboardId: row.id, ...record },
        update: record,
      });
      return true;
    });
    if (landed) counts.updated += 1;
    else counts.raced += 1;
  }

  if (APPLY && newTombstones.length > 0) {
    await prisma.sourceTombstone.createMany({
      data: newTombstones.map(slug => ({ slug, reason: "first_sync" })),
    });
  }

  // Gone from the feed. Marked once, on the run that first misses it.
  const vanished = existing.filter(r => !presentSlugs.has(r.slug) && r.sourceRecord?.missingSince == null);
  counts.marked = vanished.length;
  if (APPLY && vanished.length > 0) {
    const now = new Date();
    const withRecord = vanished.filter(r => r.sourceRecord).map(r => r.id);
    const withoutRecord = vanished.filter(r => !r.sourceRecord).map(r => r.id);
    await prisma.billboardSource.updateMany({
      where: { billboardId: { in: withRecord } },
      data:  { missingSince: now },
    });
    if (withoutRecord.length > 0) {
      await prisma.billboardSource.createMany({
        data: withoutRecord.map(billboardId => ({ billboardId, missingSince: now })),
      });
    }
  }

  report(counts, changedByField, protectedByField, raw.length, existing.length, invalid);
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
      type: asEnum(feed.type, BillboardType) ?? "billboard",
      availability: asEnum(feed.status, Availability) ?? "available",
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
      lat: feed.lat === undefined ? null : Number(feed.lat),
      lng: feed.lng === undefined ? null : Number(feed.lng),
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
      source: feed.source ?? null,
      sourceRecord: {
        create: {
          url: feed.url === undefined ? null : String(feed.url),
          structureCode: feed.structureCode === undefined ? null : String(feed.structureCode),
          scrapedAt: feed.scrapedAt ?? null,
          snapshot: snapshotOf(feed) as Prisma.InputJsonValue,
        },
      },
    },
  });
}

function report(
  counts: Record<string, number>,
  changed: Map<string, number>,
  protectedFields: Map<string, number>,
  feedSize: number,
  dbSize: number,
  invalid: { slug: string; issue: string }[],
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
  console.log(`  skipped, unreadable feed rows     : ${invalid.length}`);
  for (const { slug, issue } of invalid.slice(0, 10)) console.log(`    ${slug}: ${issue}`);
  console.log(`  skipped, edited while this ran    : ${counts.raced}`);
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
