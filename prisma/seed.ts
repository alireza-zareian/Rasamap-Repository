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

// No defaults, checked before anything is written: a seed that cannot find its
// database must not rebuild whichever file a default names (prisma.config.ts
// records that bug), and the admin comes from the same variables the server
// refuses to start without (lib/env.ts), so no database is left that nobody
// can sign in to.
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set — see .env.example`);
  return value;
}

const databaseUrl = requireEnv("DATABASE_URL");
const adminEmail  = requireEnv("ADMIN_EMAIL").toLowerCase();
const adminHash   = requireEnv("ADMIN_PASSWORD_HASH");
const adminName   = requireEnv("ADMIN_NAME");

const adapter = new PrismaBetterSqlite3({ url: databaseUrl });

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

  await prisma.admin.upsert({
    where:  { email: adminEmail },
    update: { name: adminName, passwordHash: adminHash, role: "super_admin", active: true },
    create: { email: adminEmail, passwordHash: adminHash, name: adminName, role: "super_admin" },
  });
  console.log(`Admin seeded: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
