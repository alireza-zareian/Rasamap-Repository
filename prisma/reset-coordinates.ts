// Clear lat/lng on every row, so db:backfill-coords re-geocodes them all. A
// removed map fallback ("city centre + jitter") may have left random points in
// some rows, and those cannot be told from real geocodes afterwards.
//
//   npm run db:reset-coords             dry run — prints the count
//   npm run db:reset-coords -- --apply  clears lat/lng
//
// Then empty the geocode cache and backfill:
//   echo '{}' > scraper/data/geocode_cache.json && npm run db:backfill-coords

import "./load-env";
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
