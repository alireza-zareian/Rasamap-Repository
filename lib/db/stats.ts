import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { publishedOnly } from "./billboards";
import { isPostgres } from "./engine";

export interface SiteStats {
  total: number;
  cityCount: number;
  byType: Record<string, number>;
  /** Published rows per city. The groupBy already ran for `cityCount`; keeping
   *  its rows is what lets the map colour provinces without a second query. */
  byCity: Record<string, number>;
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

  const byCity: Record<string, number> = {};
  for (const row of cityCounts) byCity[row.city] = row._count._all;

  return {
    total,
    cityCount: cityCounts.length,
    byType,
    byCity,
    totalDailyReach: Number(trafficRows[0]?.total ?? 0),
  };
}

/**
 * The columns — and only the columns — the admin dashboard's counters read.
 *
 * This used to call getAllBillboards(), which selects every column of every
 * row. The counters need eight of them; the other twenty include `traffic`,
 * `features`, `nearbyLandmarks`, `allImages` and `description`, so the endpoint
 * was decoding several megabytes of JSON for 3,536 rows and then building 3,536
 * full objects, to end up reporting a handful of integers. Measured on the real
 * table: 95 ms for the whole row against 8.3 ms for these eight.
 *
 * It stays a row read rather than a set of GROUP BYs because one of the figures
 * — the ~50 m grid that estimates how many boards sit on top of each other —
 * needs every coordinate anyway, and two floats per row is cheap. The rest is
 * counted in one pass over what that read already has.
 *
 * `images` is read rather than the denormalised `hasImages`, even though the
 * two agree on every row today, so that the "missing a photo" figure keeps
 * answering the question it claims to answer and cannot quietly start tracking
 * a flag instead.
 */
export type AdminStatsRow = Awaited<ReturnType<typeof getAdminStatsRows>>[number];

export async function getAdminStatsRows() {
  return prisma.billboard.findMany({
    select: {
      status: true, source: true, city: true, type: true,
      lat: true, lng: true, images: true, scrapedAt: true,
    },
    // The same order getAllBillboards() used. Nothing here depends on it
    // arithmetically — but `bySource`, `byCity` and `byType` are built by
    // walking these rows, so the order decides the order of the keys, and the
    // panel renders those lists in the order it receives them. Dropping the
    // sort would have quietly reshuffled the admin dashboard.
    orderBy: [{ hasImages: "desc" }, { id: "asc" }],
  });
}
