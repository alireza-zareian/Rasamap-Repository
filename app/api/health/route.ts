import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { publicApiRateLimit } from "@/lib/rate-limit";
import { pingDatabase } from "@/lib/db/health";
import { logger } from "@/lib/logger";

/**
 * Liveness and readiness for a proxy, watchdog or uptime monitor. It runs a
 * query, because the failure worth catching is Node answering while every page
 * behind it is a 500. The body is bare — no engine, version or uptime for a
 * stranger to fingerprint; a failure's reason goes to the log. No request log:
 * it is polled every few seconds.
 */
export const GET = defineRoute(
  { name: "health", access: "public", rateLimit: publicApiRateLimit, log: false },
  async () => {
    try {
      await pingDatabase();
    } catch (err) {
      logger.error("health: database unreachable", {
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ status: "degraded" }, { status: 503 });
    }
    // A cached answer would report the cache's health.
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  },
);
