import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { published } from "./billboards";
import { isPostgres } from "./engine";
import type { AdminStats } from "@/lib/admin/types";

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
    WHERE moderation = 'approved'
  `;
}

export async function getSiteStats(): Promise<SiteStats> {
  const [total, typeCounts, cityCounts, trafficRows] = await Promise.all([
    prisma.billboard.count({ where: published }),
    prisma.billboard.groupBy({
      by: ["type"],
      where: published,
      _count: { _all: true },
    }),
    prisma.billboard.groupBy({
      by: ["city"],
      where: published,
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
 * The admin dashboard's counters.
 *
 * They read the columns — and only the columns — they need.
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
async function getAdminStatsRows() {
  return prisma.billboard.findMany({
    select: {
      availability: true, source: true, city: true, type: true,
      lat: true, lng: true, images: true,
      sourceRecord: { select: { scrapedAt: true } },
    },
    // The same order getAllBillboards() used. Nothing here depends on it
    // arithmetically — but `bySource`, `byCity` and `byType` are built by
    // walking these rows, so the order decides the order of the keys, and the
    // panel renders those lists in the order it receives them. Dropping the
    // sort would have quietly reshuffled the admin dashboard.
    orderBy: [{ hasImages: "desc" }, { id: "asc" }],
  });
}

export async function getAdminStats(): Promise<AdminStats> {
  const all = await getAdminStatsRows();
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;

  const bySource: Record<string, number> = {};
  const byCity:   Record<string, number> = {};
  const byType:   Record<string, number> = {};

  let withCoords = 0, missingCoords = 0, missingImages = 0, recentlyImported = 0;

  for (const b of all) {
    const src = b.source || "manual";
    bySource[src] = (bySource[src] || 0) + 1;
    byCity[b.city] = (byCity[b.city] || 0) + 1;
    byType[b.type] = (byType[b.type] || 0) + 1;
    if (b.lat && b.lng) withCoords++; else missingCoords++;
    if (((b.images ?? []) as string[]).length === 0) missingImages++;
    const scrapedAt = b.sourceRecord?.scrapedAt;
    if (scrapedAt && now - new Date(scrapedAt).getTime() < week) recentlyImported++;
  }

  // Rough count of "boards sitting on top of each other": bucket coordinates
  // into a ~50 m grid and count cells holding two or more. O(n) instead of the
  // O(n²) pairwise scan — for ~3.5k rows that's the difference between a few
  // million ops and a few thousand. It's only a heuristic either way.
  const GRID = 0.00045; // ≈ 50 m in latitude degrees
  const cell = new Map<string, number>();
  for (const b of all) {
    if (!b.lat || !b.lng) continue;
    const key = `${Math.round(b.lat / GRID)}:${Math.round(b.lng / GRID)}`;
    cell.set(key, (cell.get(key) ?? 0) + 1);
  }
  let duplicateGroups = 0;
  for (const n of cell.values()) if (n >= 2) duplicateGroups++;

  return {
    total: all.length,
    active: all.filter(b => b.availability !== "inactive").length,
    inactive: all.filter(b => b.availability === "inactive").length,
    bySource, byCity, byType,
    withCoords, missingCoords, missingImages,
    recentlyImported, duplicateGroups,
  };
}
