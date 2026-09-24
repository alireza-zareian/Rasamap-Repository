import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { adminApiRateLimit } from "@/lib/rate-limit";
import { getAdminStats } from "@/lib/db/stats";

// GET /api/admin/billboards/stats — the dashboard's counters (any staff).
export const GET = defineRoute(
  { name: "admin/billboards/stats", access: { staff: "viewer" }, rateLimit: adminApiRateLimit },
  async () => NextResponse.json(await getAdminStats()),
);
