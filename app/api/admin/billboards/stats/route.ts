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

  // Detect rough duplicate groups by coordinate proximity
  let duplicateGroups = 0;
  const withCoordsList = all.filter(b => b.lat && b.lng);
  const seen = new Set<number>();
  for (let i = 0; i < withCoordsList.length; i++) {
    if (seen.has(i)) continue;
    const a = withCoordsList[i];
    let group = false;
    for (let j = i + 1; j < withCoordsList.length; j++) {
      if (seen.has(j)) continue;
      const bItem = withCoordsList[j];
      const dlat = (a.lat! - bItem.lat!) * 111000;
      const dlng = (a.lng! - bItem.lng!) * 111000 * Math.cos((a.lat! * Math.PI) / 180);
      if (Math.sqrt(dlat * dlat + dlng * dlng) < 50) {
        seen.add(j);
        group = true;
      }
    }
    if (group) { seen.add(i); duplicateGroups++; }
  }

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
