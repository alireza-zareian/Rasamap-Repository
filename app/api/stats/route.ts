import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";

export const revalidate = 3600; // cache 1 hour

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

export async function GET(req: NextRequest) {
  const rl = publicApiRateLimit(getIP(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });
  const [total, typeCounts, cityCounts, trafficRows] = await Promise.all([
    prisma.billboard.count({ where: { status: { not: "pending" } } }),
    prisma.billboard.groupBy({
      by: ["type"],
      where: { status: { not: "pending" } },
      _count: { _all: true },
    }),
    prisma.billboard.groupBy({
      by: ["city"],
      where: { status: { not: "pending" } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ total: number }[]>`
      SELECT SUM(CAST(json_extract(traffic, '$.daily') AS INTEGER)) as total
      FROM billboards WHERE status != 'pending'
    `,
  ]);

  const byType: Record<string, number> = {};
  for (const row of typeCounts) byType[row.type] = row._count._all;

  const totalDailyReach = Number(trafficRows[0]?.total ?? 0);

  return NextResponse.json(
    {
      total,
      cityCount: cityCounts.length,
      byType,
      totalDailyReach,
    },
    { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } },
  );
}
