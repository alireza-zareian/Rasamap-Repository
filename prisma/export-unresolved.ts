// ============================================================
// RASAMAP — Export unresolved-coordinates rows for manual review
//
// After db:backfill-coords stabilizes (re-running it barely changes
// the unresolved count anymore — i.e. it's no longer a quota/rate-limit
// issue), the remaining rows are ones whose `location` text alone isn't
// specific enough for Neshan to geocode. This dumps them to a CSV
// (id, name, city, location, source) so they can be reviewed by hand —
// some just need a more complete address typed in, others are
// genuinely too vague (e.g. just a neighborhood name) and will stay
// on the "city center + no marker" fallback in RealMap.tsx.
//
// Usage:
//   npm run db:export-unresolved
//   -> writes scraper/data/unresolved-coords.csv
// ============================================================

import "dotenv/config";
import { writeFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

function csvEscape(v: string | null | undefined): string {
  const s = v ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const rows = await prisma.billboard.findMany({
    where: { OR: [{ lat: null }, { lng: null }] },
    orderBy: [{ city: "asc" }, { location: "asc" }],
    select: { id: true, name: true, city: true, region: true, location: true, source: true },
  });

  if (rows.length === 0) {
    console.log("Nothing unresolved — every row already has coordinates.");
    return;
  }

  const header = "id,name,city,region,location,source";
  const lines = rows.map((r) =>
    [r.id, csvEscape(r.name), csvEscape(r.city), csvEscape(r.region), csvEscape(r.location), csvEscape(r.source)].join(",")
  );

  const outPath = path.join(process.cwd(), "scraper", "data", "unresolved-coords.csv");
  writeFileSync(outPath, [header, ...lines].join("\n"), "utf-8");

  console.log(`Wrote ${rows.length} unresolved row(s) to ${outPath}`);

  // Quick breakdown by city so you can see where the bulk of the problem is.
  // Raw counts are misleading on their own (Tehran has the most billboards
  // overall, so it'll always have the most unresolved too) — the useful
  // signal is the unresolved RATE per city, so also fetch each city's total.
  const totalsByCity = await prisma.billboard.groupBy({
    by: ["city"],
    _count: { _all: true },
  });
  const totalMap = new Map(totalsByCity.map((t) => [t.city, t._count._all]));

  const byCity = new Map<string, number>();
  for (const r of rows) byCity.set(r.city, (byCity.get(r.city) ?? 0) + 1);

  const sorted = [...byCity.entries()]
    .map(([city, unresolved]) => {
      const total = totalMap.get(city) ?? unresolved;
      return { city, unresolved, total, rate: unresolved / total };
    })
    .sort((a, b) => b.rate - a.rate);

  console.log("\nBreakdown by city (sorted by unresolved RATE, not raw count):");
  console.log("  city                 unresolved / total   rate");
  for (const { city, unresolved, total, rate } of sorted.slice(0, 20)) {
    console.log(`  ${city.padEnd(18)} ${String(unresolved).padStart(4)} / ${String(total).padEnd(6)} ${(rate * 100).toFixed(0)}%`);
  }
  if (sorted.length > 20) console.log(`  ...and ${sorted.length - 20} more cities`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
