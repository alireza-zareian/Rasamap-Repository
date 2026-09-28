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
  /** Published rows per city — the `cityCount` groupBy's rows, which colour the map. */
  byCity: Record<string, number>;
  totalDailyReach: number;
}

/**
 * SUM of traffic.daily over published rows. Raw SQL because Prisma cannot sum
 * through a JSON path, and the one fragment the two engines spell differently.
 */
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

/** The landing page's headline numbers; also what GET /api/stats answers. */
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
 * The admin dashboard's counters, from eight columns only: whole rows cost
 * 95 ms, these 8.3 ms. A row read rather than GROUP BYs because the overlap
 * grid below needs every coordinate anyway. `images` rather than `hasImages`,
 * so "missing a photo" counts photos, not a flag.
 */
async function getAdminStatsRows() {
  return prisma.billboard.findMany({
    select: {
      availability: true, source: true, city: true, type: true,
      lat: true, lng: true, images: true,
      sourceRecord: { select: { scrapedAt: true } },
    },
    // The row order becomes the key order of bySource/byCity/byType, which the panel renders as is.
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

  // Boards on top of each other, roughly: cells of a ~50 m grid holding two or
  // more. O(n), where a pairwise scan was O(n²). A heuristic.
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
