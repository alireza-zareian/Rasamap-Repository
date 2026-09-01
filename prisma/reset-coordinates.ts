// ============================================================
// RASAMAP — Coordinate reset script
//
// Why this exists: some rows may have had their lat/lng overwritten by
// an older, now-removed random "city center + jitter" fallback that
// used to live in components/RealMap.tsx. Those values look like real
// coordinates (they're valid numbers, "plausible" distance-wise) but
// aren't real geocodes — there's no reliable way to tell them apart
// from genuinely-geocoded rows after the fact.
//
// Rather than guessing which rows are contaminated, this script just
// resets lat/lng to NULL for every row, so a full re-run of
// `npm run db:backfill-coords` re-geocodes everything from scratch
// against the real Neshan API. Slower, but zero ambiguity.
//
// SAFE BY DEFAULT: running with no flags only PRINTS how many rows
// would be reset — it changes nothing.
//
// Usage:
//   npm run db:reset-coords            (dry run — just shows the count)
//   npm run db:reset-coords -- --apply (actually clears lat/lng)
//
// After running with --apply, also clear the geocode cache so stale
// cached results (from before the jitter incident) don't get reused:
//   echo '{}' > scraper/data/geocode_cache.json
// Then run: npm run db:backfill-coords
// ============================================================

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

async function main() {
  const count = await prisma.billboard.count({
    where: { OR: [{ lat: { not: null } }, { lng: { not: null } }] },
  });

  if (count === 0) {
    console.log("No rows currently have coordinates. Nothing to reset.");
    return;
  }

  console.log(`Found ${count} row(s) with a lat/lng value set.`);

  if (!APPLY) {
    console.log(
      `\nDry run only — nothing changed. Re-run with --apply to reset all ${count} row(s) to NULL,\n` +
        `then clear scraper/data/geocode_cache.json and run npm run db:backfill-coords to re-geocode everything for real.`
    );
    return;
  }

  console.log(`\n--apply passed — resetting ${count} row(s) to NULL...`);
  const result = await prisma.billboard.updateMany({
    data: { lat: null, lng: null },
  });
  console.log(`Reset ${result.count} row(s).`);
  console.log(
    `\nNext steps:\n` +
      `  1. echo '{}' > scraper/data/geocode_cache.json\n` +
      `  2. npm run db:backfill-coords`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
