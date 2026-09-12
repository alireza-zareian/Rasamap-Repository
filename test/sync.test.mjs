// The scheduled crawler import — prisma/sync-scraped.ts.
//
// These run the real script as a subprocess against the same isolated test
// database the API suite uses, with a fixture feed instead of the crawler's
// 3,528-row output. They are in their own file because nothing here is an HTTP
// call: the script is a command, and the thing worth proving is what it does to
// rows, not what any route answers.
//
// What each test is defending is the same promise in a different shape: a
// nightly import must never undo a decision a person made. An edited price, a
// deleted duplicate, a row taken off the site — the feed does not know about
// any of them, so the importer has to.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { api, mintSession } from "./helpers.mjs";

const DB = process.env.DATABASE_URL || "file:./prisma/test.db";
const WORK = mkdtempSync(join(tmpdir(), "rasamap-sync-"));

function prisma() {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: DB }) });
}

/** Run one row of a crawler feed. Only the fields the importer reads matter. */
function feedRow(slug, over = {}) {
  return {
    id: over.id ?? 900001,
    slug,
    name: "Sync Fixture",
    location: "خیابان آزمون",
    region: "منطقه ۱",
    city: "تهران",
    type: "billboard",
    status: "available",
    width: 10, height: 4, faces: 1, age: 3,
    price: 1000, priceWeekly: 250, priceQuarterly: 2700, priceYearly: 9600,
    traffic: { daily: 100, peakHour: "08:00-09:00", congestionLevel: 3, pedestrian: 500, estimatedViews: 700, viewabilityScore: 40 },
    mapX: 10, mapY: 20,
    icon: "🏙️",
    images: [],
    agency: "آژانس آزمون",
    phone: "02100000000",
    description: "Sync Fixture",
    features: [], nearbyLandmarks: [],
    rating: 4.2, reviewCount: 5,
    source: "billboardiha",
    scrapedAt: "2026-09-12T00:00:00.000000",
    ...over,
  };
}

/** Write a feed and run the importer over it. Returns its printed report. */
function sync(rows, { apply = true } = {}) {
  const file = join(WORK, `feed-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(rows));
  const args = ["tsx", "prisma/sync-scraped.ts", `--feed=${file}`];
  if (apply) args.push("--apply");
  return execFileSync("npx", args, {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: DB },
  });
}

/** "updated : 3" → 3 */
function counted(report, label) {
  const m = report.match(new RegExp(`${label}[^:]*: (\\d+)`));
  assert.ok(m, `the report has no "${label}" line:\n${report}`);
  return Number(m[1]);
}

const A = "scraped-sync-a";
const B = "scraped-sync-b";

test("a feed row the database does not have is inserted", async () => {
  const report = sync([feedRow(A, { id: 900001 }), feedRow(B, { id: 900002, price: 2000 })]);
  assert.equal(counted(report, "inserted"), 2, report);

  const db = prisma();
  try {
    const row = await db.billboard.findUnique({ where: { slug: A } });
    assert.equal(row?.price, 1000);
    // The denormalised sort keys are computed on the way in, not left at zero.
    assert.equal(row?.area, 40);
    assert.equal(row?.estimatedViews, 700);
  } finally { await db.$disconnect(); }
});

test("the feed updates a row nobody has touched, and never one an admin edited", async () => {
  const db = prisma();
  try {
    // An admin corrects A's price. B is left as the crawler left it.
    await db.billboard.update({ where: { slug: A }, data: { price: 777 } });
    const before = await db.billboard.findUnique({ where: { slug: A }, select: { updatedAt: true } });

    // The next crawl raises both prices.
    const report = sync([
      feedRow(A, { id: 900001, price: 1500 }),
      feedRow(B, { id: 900002, price: 2500 }),
    ]);

    const a = await db.billboard.findUnique({ where: { slug: A } });
    const b = await db.billboard.findUnique({ where: { slug: B } });
    assert.equal(a?.price, 777, "the feed overwrote a price an admin had corrected");
    assert.equal(b?.price, 2500, "the feed did not update a row nobody had touched");

    // And the row it left alone was not written at all: `updatedAt` is what the
    // catalogue cache keys off, so touching it nightly for nothing would throw
    // the cache away every night.
    assert.deepEqual(a?.updatedAt, before?.updatedAt, "an untouched row's updatedAt moved");

    // The report names the disagreement rather than hiding it — that line is
    // how an operator finds out the site and its source no longer agree.
    assert.match(report, /fields an admin owns, left alone : price×1/);
  } finally { await db.$disconnect(); }
});

test("running the same feed twice writes nothing the second time", async () => {
  const rows = [feedRow(A, { id: 900001, price: 1500 }), feedRow(B, { id: 900002, price: 2500 })];
  sync(rows);
  const report = sync(rows);
  assert.equal(counted(report, "updated"), 0, report);
  assert.equal(counted(report, "inserted"), 0, report);
});

test("a row that disappears from the feed is marked, not deleted — and unmarked if it returns", async () => {
  const db = prisma();
  try {
    const gone = sync([feedRow(A, { id: 900001, price: 1500 })]);
    assert.equal(counted(gone, "marked missing"), 1, gone);

    const b = await db.billboard.findUnique({ where: { slug: B } });
    assert.ok(b, "a row that left the feed was deleted — its reviews would have gone with it");
    assert.ok(b.missingSince instanceof Date, "the row was not marked as missing");

    const back = sync([feedRow(A, { id: 900001, price: 1500 }), feedRow(B, { id: 900002, price: 2500 })]);
    assert.equal(counted(back, "back after being missing"), 1, back);
    const returned = await db.billboard.findUnique({ where: { slug: B } });
    assert.equal(returned?.missingSince, null);
  } finally { await db.$disconnect(); }
});

test("a crawler row an admin deleted does not come back on the next run", async () => {
  const db = prisma();
  try {
    const row = await db.billboard.findUnique({ where: { slug: B }, select: { id: true } });
    // Through the admin route itself, so the tombstone is written by the path a
    // person actually triggers rather than by a function this test picked.
    const del = await api(`/api/admin/billboards/${row.id}`, {
      method: "DELETE",
      token: await mintSession({ role: "admin" }),
    });
    assert.equal(del.status, 200, JSON.stringify(del.json));

    const report = sync([feedRow(A, { id: 900001, price: 1500 }), feedRow(B, { id: 900002, price: 2500 })]);
    assert.equal(counted(report, "refused"), 1, report);
    assert.equal(await db.billboard.findUnique({ where: { slug: B } }), null, "the deleted row was re-created");
  } finally { await db.$disconnect(); }
});
