import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { prisma } from "@/lib/db/client";
import { publishedOnly } from "@/lib/db/billboards";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";
import { withApiLog } from "@/lib/api-log";

export const revalidate = 3600; // cache 1 hour

async function getHandler(req: NextRequest) {
  const rl = publicApiRateLimit(getClientIp(req));
  if (!rl.allowed) return NextResponse.json({ error: "درخواست‌های زیادی ارسال شده است" }, { status: 429 });
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
    prisma.$queryRaw<{ total: number }[]>`
      SELECT SUM(CAST(json_extract(traffic, '$.daily') AS INTEGER)) as total
      FROM billboards WHERE status NOT IN ('pending', 'awaiting_payment')
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

export const GET = withApiLog("stats", getHandler);
