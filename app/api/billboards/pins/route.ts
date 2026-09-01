import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";

// Slim billboard data for map markers — all geocoded, non-pending billboards.
// Revalidated every 5 minutes; payload is ~400KB uncompressed, ~60KB gzipped.
export const revalidate = 300;

const BOT_UA_PATTERNS = [
  /python-requests/i, /scrapy/i, /curl\/\d/i, /wget\//i,
  /go-http-client/i, /java\//i, /libwww/i, /lwp-/i,
  /headlesschrome/i, /phantomjs/i, /htmlunit/i, /selenium/i,
  /playwright/i, /puppeteer/i,
];

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "";

  if (BOT_UA_PATTERNS.some(p => p.test(ua))) {
    return NextResponse.json({ pins: [], total: 0 });
  }

  const rl = publicApiRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "درخواست‌های بیش از حد مجاز" },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.lockedUntil! - Date.now()) / 1000)) } },
    );
  }

  try {
    const rows = await prisma.billboard.findMany({
      where: {
        lat: { not: null },
        lng: { not: null },
        status: { not: "pending" },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        lat: true,
        lng: true,
        status: true,
        icon: true,
        city: true,
        region: true,
        price: true,
        width: true,
        height: true,
        traffic: true,
      },
    });

    const pins = rows.map(r => {
      let estimatedViews = 0;
      try {
        const t = r.traffic as any;
        if (t && typeof t === "object") estimatedViews = t.estimatedViews ?? 0;
        else if (typeof r.traffic === "string") estimatedViews = JSON.parse(r.traffic)?.estimatedViews ?? 0;
      } catch { /* ignore malformed traffic JSON */ }

      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        lat: r.lat,
        lng: r.lng,
        status: r.status,
        icon: r.icon,
        city: r.city,
        region: r.region,
        price: r.price,
        width: r.width,
        height: r.height,
        estimatedViews,
      };
    });

    return NextResponse.json(
      { pins, total: pins.length },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("GET /api/billboards/pins failed:", err);
    return NextResponse.json({ error: "خطا در بارگذاری موقعیت‌ها" }, { status: 500 });
  }
}
