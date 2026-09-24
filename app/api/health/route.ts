import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/http/route";
import { publicApiRateLimit } from "@/lib/rate-limit";
import { pingDatabase } from "@/lib/db/health";
import { logger } from "@/lib/logger";

/**
 * Liveness and readiness in one endpoint, for whatever is watching the process
 * once it lives on a real host — a reverse proxy's upstream check, a systemd
 * watchdog, an uptime pinger.
 *
 * "Is the process answering?" is the easy half and a 200 covers it. The half
 * that matters is "can it still reach its database?", because the failure this
 * is meant to catch is the one where Node is happily accepting connections and
 * every page behind it is a 500. So the check runs a query rather than merely
 * returning a constant.
 *
 * The response is deliberately bare. This is a public URL, and an
 * unauthenticated endpoint that reports the engine, the version or the uptime
 * is a fingerprint handed to whoever asks. The monitor needs the status code;
 * the reason for a failure goes to the log.
 *
 * The public budget (600/minute) is far above any sane monitor and still bounds
 * an unauthenticated endpoint that touches the database. It is the one route
 * that writes no request log: it is polled every few seconds forever, and
 * logging it would bury the requests that matter under 8,000 lines a day of
 * "still fine". A failure is still logged.
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
    // A cached health check reports the health of the cache.
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  },
);
