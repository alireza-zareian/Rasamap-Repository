import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

const Schema = z.object({
  city: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const rl = publicApiRateLimit(getIP(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });

  const parsed = Schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "پارامتر نامعتبر" }, { status: 400 });

  const baseWhere = {
    status: { not: "pending" as const },
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
      where: { status: { not: "pending" } },
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
    prisma.billboard.count({ where: { ...baseWhere, images: { not: "[]" } } }),
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
