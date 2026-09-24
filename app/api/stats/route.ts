import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { publicApiRateLimit } from "@/lib/rate-limit";
import { getSiteStats } from "@/lib/db/stats";

export const GET = defineRoute(
  { name: "stats", access: "public", rateLimit: publicApiRateLimit },
  async () => NextResponse.json(
    await getSiteStats(),
    { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } },
  ),
);
