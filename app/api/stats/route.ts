import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { getSiteStats } from "@/lib/db/stats";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";
import { withApiLog } from "@/lib/api-log";

export const revalidate = 3600; // cache 1 hour

async function getHandler(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = publicApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "stats", ip });
  const stats = await getSiteStats();

  return NextResponse.json(
    stats,
    { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } },
  );
}

export const GET = withApiLog("stats", getHandler);
