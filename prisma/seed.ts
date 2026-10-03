// Load lib/data.ts's `everyBillboard` (curated + scraped) into the Billboard
// table with its numeric ids unchanged, and create the admin account.
//
//   npm run db:seed        after `npm run db:migrate`
//
// A full rebuild of the crawled rows; on a live database use
// `npm run db:sync-scraped` instead (§33).

import "./load-env";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { everyBillboard } from "../lib/data";
import { canonicalCity } from "../lib/geo/iran-cities";
import { availabilityFromFeed } from "../lib/domain/billboard";

type StaticBillboard = (typeof everyBillboard)[number];

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

/**
 * The source's single `status` is always a description of the board, so it
 * becomes the row's availability; review state is the database's own and a
 * seeded row starts `approved` (the column default).
 */
function toRow(b: StaticBillboard) {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    location: b.location,
    region: b.region,
    city: canonicalCity(b.city),
    type: b.type,
    // A crawled row's "available" is "listed at the source", not "free".
    availability: b.source ? availabilityFromFeed(b.status) ?? "unknown" : b.status,
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
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    hasImages: Array.isArray(b.images) && b.images.length > 0,
    images: b.images as unknown as object,
    allImages: b.allImages ? (b.allImages as unknown as object) : Prisma.JsonNull,
    agency: b.agency,
    // The dataset always carries one; the field is optional on the domain type
    // because a Billboard that has reached a browser has had it stripped.
    phone: b.phone ?? "—",
    description: b.description,
    features: b.features as unknown as object,
    nearbyLandmarks: b.nearbyLandmarks as unknown as object,
    // Unrated, whatever the dataset says: its figures were invented, and the
    // reviews table is the only source of a rating (lib/db/reviews.ts).
    rating: 0,
    reviewCount: 0,
    source: b.source ?? null,
  };
}

/** A crawled row's bookkeeping — see BillboardSource in the schema. */
function toSourceRecord(b: StaticBillboard) {
  return {
    url: b.url ?? null,
    structureCode: b.structureCode ?? null,
    scrapedAt: b.scrapedAt ?? null,
  };
}

async function main() {
  // Checked before the long upsert, not after it.
  const adminHash = process.env.ADMIN_PASSWORD_HASH;
  // A bcrypt hash is 60 characters: $2b$, the cost, $, then 53 of salt and hash.
  // Anything else is what the env loader left of one whose "$" was not escaped.
  if (adminHash && !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(adminHash)) {
    throw new Error(
      "ADMIN_PASSWORD_HASH is not a whole bcrypt hash. The env files expand $NAME, " +
      "so write every $ in it as \\$ (see .env.example), then seed again.",
    );
  }
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

  // Remove rows the source no longer has, except customer listings, which were
  // never in it. Raw SQL: a notIn this long passes SQLite's bound-variable limit.
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
    // Only a crawled row has source bookkeeping; the curated set has no source.
    const source = b.source ? toSourceRecord(b) : null;
    await prisma.billboard.upsert({
      where: { id: b.id },
      update: { ...toRow(b), ...(source ? { sourceRecord: { upsert: { create: source, update: source } } } : {}) },
      create: { ...toRow(b), ...(source ? { sourceRecord: { create: source } } : {}) },
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
