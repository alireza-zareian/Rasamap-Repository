import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/http/route";
import { publicApiRateLimit } from "@/lib/rate-limit";
import { getCatalogueAnalytics } from "@/lib/db/analytics";

export const GET = defineRoute(
  {
    name: "analytics",
    access: "public",
    rateLimit: publicApiRateLimit,
    query: z.object({ city: z.string().max(100).optional() }),
  },
  async ({ query }) => NextResponse.json(
    await getCatalogueAnalytics(query.city),
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  ),
);
