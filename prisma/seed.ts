// ============================================================
// RASAMAP — Seed script (Phase 3)
//
// Migrates the current static + scraped billboard data into the
// Billboard table, preserving existing numeric ids exactly
// (RealMap.tsx COORDS, CompareBar and detail routes depend on them).
//
// Source of truth for "how many rows should exist after seeding":
// lib/data.ts::everyBillboard = [...billboards, ...extraBillboards, ...scrapedBillboards]
//
// Usage:
//   npx prisma migrate dev --name init      (creates the SQLite db + tables)
//   npx prisma db seed                      (runs this script)
// ============================================================

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { everyBillboard } from "../lib/data";

type StaticBillboard = (typeof everyBillboard)[number];

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

function toRow(b: StaticBillboard) {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    location: b.location,
    region: b.region,
    city: b.city,
    type: b.type,
    status: b.status,
    width: b.width,
    height: b.height,
    // Denormalised sort keys — see the comments on the schema fields.
    area: b.width * b.height,
    faces: b.faces,
    age: b.age,
    price: b.price,
    priceWeekly: b.priceWeekly,
    priceQuarterly: b.priceQuarterly,
    priceYearly: b.priceYearly,
    traffic: b.traffic as unknown as object,
    estimatedViews: b.traffic?.estimatedViews ?? 0,
    mapX: b.mapX,
    mapY: b.mapY,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    icon: b.icon,
    hasImages: Array.isArray(b.images) && b.images.length > 0,
    images: b.images as unknown as object,
    allImages: b.allImages ? (b.allImages as unknown as object) : Prisma.JsonNull,
    agency: b.agency,
    phone: b.phone,
    description: b.description,
    features: b.features as unknown as object,
    nearbyLandmarks: b.nearbyLandmarks as unknown as object,
    rating: b.rating,
    reviewCount: b.reviewCount,
    url: b.url ?? null,
    source: b.source ?? null,
    structureCode: b.structureCode ?? null,
    scrapedAt: b.scrapedAt ?? null,
    // ownerId intentionally omitted — no real Owner accounts exist yet (Phase 7).
  };
}

async function main() {
  console.log(`Seeding ${everyBillboard.length} billboards...`);

  // Guard against duplicate ids in the source data itself — if this ever
  // fires, it means lib/data.ts or the scraper output has a collision that
  // must be fixed before seeding, not silently overwritten here.
  const seenIds = new Set<number>();
  for (const b of everyBillboard) {
    if (seenIds.has(b.id)) {
      throw new Error(`Duplicate billboard id ${b.id} found in source data — aborting seed.`);
    }
    seenIds.add(b.id);
  }

  // Remove stale records — rows in DB that no longer exist in the source data.
  // Uses raw SQL because SQLite's bound-variable limit (~999) blocks large notIn lists.
  //
  // Rows submitted by users through /list-media are exempt: they were never in
  // lib/data.ts and never will be, so a plain "delete what isn't in the source"
  // would wipe every customer listing on the next re-seed.
  const newIds = everyBillboard.map(b => b.id).join(",");
  const staleFilter = `id NOT IN (${newIds}) AND (source IS NULL OR source != 'listing')`;
  const stale: Array<{ count: bigint }> =
    await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM billboards WHERE ${staleFilter}`);
  const staleCount = Number(stale[0]?.count ?? 0);
  if (staleCount > 0) {
    await prisma.$executeRawUnsafe(`DELETE FROM billboards WHERE ${staleFilter}`);
    console.log(`Removed ${staleCount} stale rows not present in new data.`);
  }

  let created = 0;
  for (const b of everyBillboard) {
    await prisma.billboard.upsert({
      where: { id: b.id },
      update: toRow(b),
      create: toRow(b),
    });
    created++;
  }

  const count = await prisma.billboard.count();
  const listingCount = await prisma.billboard.count({ where: { source: "listing" } });
  console.log(`Done. Upserted ${created} rows. Billboard table now has ${count} rows (${listingCount} user listings).`);

  // The assertion covers only what this script owns; user listings are extra.
  if (count - listingCount !== everyBillboard.length) {
    throw new Error(
      `Mismatch: Billboard table has ${count - listingCount} seeded rows but everyBillboard.length is ${everyBillboard.length}.`
    );
  }

  // Seed admin from env vars (idempotent upsert)
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const adminHash  = process.env.ADMIN_PASSWORD_HASH;
  const adminName  = process.env.ADMIN_NAME ?? "مدیر سیستم";
  if (adminEmail && adminHash) {
    await prisma.admin.upsert({
      where:  { email: adminEmail },
      update: { name: adminName, passwordHash: adminHash, role: "super_admin", active: true },
      create: { email: adminEmail, passwordHash: adminHash, name: adminName, role: "super_admin" },
    });
    console.log(`Admin seeded: ${adminEmail}`);
  } else {
    console.warn("ADMIN_EMAIL or ADMIN_PASSWORD_HASH not set — admin not seeded.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
