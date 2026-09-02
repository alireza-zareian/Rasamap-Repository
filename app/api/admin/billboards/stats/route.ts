import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import type { AdminStats } from "@/lib/admin/types";
import { getAllBillboards } from "@/lib/db/billboards";
import { getSession } from "@/lib/auth/session";
import { adminApiRateLimit } from "@/lib/auth/rate-limit";
import { withApiLog } from "@/lib/api-log";

async function GETHandler(req: NextRequest) {
  // ── Auth guard ──
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "احراز هویت لازم است" }, { status: 401 });
  }

  // ── Rate limit ──
  const rl = adminApiRateLimit(getClientIp(req));
  if (!rl.allowed) {
    return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });
  }

  const all = await getAllBillboards();
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
    if (!b.images || b.images.length === 0) missingImages++;
    if (b.scrapedAt && now - new Date(b.scrapedAt).getTime() < week) recentlyImported++;
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

  const stats: AdminStats = {
    total: all.length,
    active: all.filter(b => b.status !== "inactive").length,
    inactive: all.filter(b => b.status === "inactive").length,
    bySource, byCity, byType,
    withCoords, missingCoords, missingImages,
    recentlyImported, duplicateGroups,
  };

  return NextResponse.json(stats, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const GET = withApiLog("admin/billboards/stats", GETHandler);
