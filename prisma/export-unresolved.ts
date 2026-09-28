// Write the rows db:backfill-coords could not place to a CSV for review by
// hand: their address is too vague for Neshan, and they have no map pin.
//
//   npm run db:export-unresolved   → scraper/data/unresolved-coords.csv

import "./load-env";
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

  // Per city as a rate, not a count: Tehran has the most rows of every kind.
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
