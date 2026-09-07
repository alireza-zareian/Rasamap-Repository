import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { publishedOnly } from "./billboards";
import { isPostgres } from "./engine";

export interface SiteStats {
  total: number;
  cityCount: number;
  byType: Record<string, number>;
  totalDailyReach: number;
}

/**
 * The four headline numbers on the landing page.
 *
 * Lifted out of GET /api/stats when the landing page became a Server Component
 * in V1: the page reads it directly and the route still answers with it, but
 * the four aggregate queries are written once.
 *
 * `totalDailyReach` is raw SQL because the daily footfall lives inside the
 * `traffic` JSON column and Prisma cannot sum through a JSON path. Reading
 * inside JSON is the one thing the two engines spell differently, so the
 * fragment — and only the fragment — is chosen by engine.
 */
/** SUM of traffic.daily across published rows — the only engine-specific SQL. */
function dailyReachQuery(): Prisma.Sql {
  const daily = isPostgres()
    ? Prisma.sql`(traffic ->> 'daily')::bigint`
    : Prisma.sql`CAST(json_extract(traffic, '$.daily') AS INTEGER)`;
  return Prisma.sql`
    SELECT SUM(${daily}) AS total
    FROM billboards
    WHERE status NOT IN ('pending', 'awaiting_payment')
  `;
}

export async function getSiteStats(): Promise<SiteStats> {
  const [total, typeCounts, cityCounts, trafficRows] = await Promise.all([
    prisma.billboard.count({ where: { status: publishedOnly } }),
    prisma.billboard.groupBy({
      by: ["type"],
      where: { status: publishedOnly },
      _count: { _all: true },
    }),
    prisma.billboard.groupBy({
      by: ["city"],
      where: { status: publishedOnly },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ total: number | bigint | null }[]>(dailyReachQuery()),
  ]);

  const byType: Record<string, number> = {};
  for (const row of typeCounts) byType[row.type] = row._count._all;

  return {
    total,
    cityCount: cityCounts.length,
    byType,
    totalDailyReach: Number(trafficRows[0]?.total ?? 0),
  };
}
