import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { publishedOnly } from "@/lib/db/billboards";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";
import { withApiLog } from "@/lib/api-log";

const Schema = z.object({
  city: z.string().optional(),
});

async function GETHandler(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = publicApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "analytics", ip });

  const parsed = Schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "پارامتر نامعتبر" }, { status: 400 });

  const baseWhere = {
    status: publishedOnly,
    ...(parsed.data.city ? { city: parsed.data.city } : {}),
  };

  const [
    total, byType, byStatus, topCities, allCitiesRaw,
    priceStats,
    bracketUnder50, bracket50to150, bracket150to300, bracketOver300,
    withImage, geocoded,
  ] = await Promise.all([
    prisma.billboard.count({ where: baseWhere }),
    prisma.billboard.groupBy({ by: ["type"],   where: baseWhere, _count: { id: true } }),
    prisma.billboard.groupBy({ by: ["status"], where: baseWhere, _count: { id: true } }),
    prisma.billboard.groupBy({
      by: ["city"], where: baseWhere, _count: { id: true },
      orderBy: { _count: { id: "desc" } }, take: 10,
    }),
    prisma.billboard.groupBy({
      by: ["city"], _count: { id: true },
      where: { status: publishedOnly },
      orderBy: { _count: { id: "desc" } }, take: 60,
    }),
    prisma.billboard.aggregate({
      where: { ...baseWhere, price: { gt: 0 } },
      _avg: { price: true }, _min: { price: true }, _max: { price: true },
    }),
    prisma.billboard.count({ where: { ...baseWhere, price: { lt: 50 } } }),
    prisma.billboard.count({ where: { ...baseWhere, price: { gte: 50, lt: 150 } } }),
    prisma.billboard.count({ where: { ...baseWhere, price: { gte: 150, lt: 300 } } }),
    prisma.billboard.count({ where: { ...baseWhere, price: { gte: 300 } } }),
    // `hasImages`, not a comparison against the `images` JSON column: a Json
    // `not` filter does not match a stringified array in SQLite, so that form
    // silently counted every row.
    prisma.billboard.count({ where: { ...baseWhere, hasImages: true } }),
    prisma.billboard.count({ where: { ...baseWhere, lat: { not: null } } }),
  ]);

  return NextResponse.json({
    total,
    byType:    Object.fromEntries(byType.map(r    => [r.type,   r._count.id])),
    byStatus:  Object.fromEntries(byStatus.map(r  => [r.status, r._count.id])),
    topCities: topCities.map(r => ({ city: r.city, count: r._count.id })),
    allCities: allCitiesRaw.map(r => r.city).filter(Boolean),
    price: {
      avg: Math.round(priceStats._avg.price ?? 0),
      min: priceStats._min.price ?? 0,
      max: priceStats._max.price ?? 0,
    },
    priceBrackets: [
      { label: "زیر ۵۰M",      count: bracketUnder50  },
      { label: "۵۰ – ۱۵۰M",   count: bracket50to150  },
      { label: "۱۵۰ – ۳۰۰M",  count: bracket150to300 },
      { label: "بالای ۳۰۰M",   count: bracketOver300  },
    ],
    coverage: { withImage, geocoded },
  }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

export const GET = withApiLog("analytics", GETHandler);
