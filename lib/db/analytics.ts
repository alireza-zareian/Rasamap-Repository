import "server-only";
import { prisma } from "./client";
import { published } from "./billboards";

/**
 * The /analytics figures, optionally for one city: counts by type, status and
 * city, four price brackets, and photo and map coverage. Every figure is a
 * COUNT or aggregate in the database; no rows are loaded.
 */
export async function getCatalogueAnalytics(city?: string) {
  const baseWhere = {
    ...published,
    ...(city ? { city } : {}),
  };

  const [
    total, byType, byAvailability, topCities, allCitiesRaw,
    priceStats,
    bracketUnder50, bracket50to150, bracket150to300, bracketOver300,
    withImage, geocoded,
  ] = await Promise.all([
    prisma.billboard.count({ where: baseWhere }),
    prisma.billboard.groupBy({ by: ["type"],   where: baseWhere, _count: { id: true } }),
    prisma.billboard.groupBy({ by: ["availability"], where: baseWhere, _count: { id: true } }),
    prisma.billboard.groupBy({
      by: ["city"], where: baseWhere, _count: { id: true },
      orderBy: { _count: { id: "desc" } }, take: 10,
    }),
    prisma.billboard.groupBy({
      by: ["city"], _count: { id: true },
      where: published,
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
    // `hasImages`: a Json `not` filter on `images` matched every row in SQLite.
    prisma.billboard.count({ where: { ...baseWhere, hasImages: true } }),
    prisma.billboard.count({ where: { ...baseWhere, lat: { not: null } } }),
  ]);

  return {
    total,
    byType:    Object.fromEntries(byType.map(r    => [r.type,   r._count.id])),
    byAvailability: Object.fromEntries(byAvailability.map(r => [r.availability, r._count.id])),
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
  };
}
