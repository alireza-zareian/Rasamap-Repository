import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/client-ip";
import { rateLimited } from "@/lib/api-rate-limit";
import { publicApiRateLimit } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

/**
 * Liveness and readiness in one endpoint, for whatever is watching the process
 * once it lives on a real host — a reverse proxy's upstream check, a systemd
 * watchdog, an uptime pinger.
 *
 * "Is the process answering?" is the easy half and a 200 covers it. The half
 * that matters is "can it still reach its database?", because the failure this
 * is meant to catch is the one where Node is happily accepting connections and
 * every page behind it is a 500. So the check does the cheapest possible query
 * rather than merely returning a constant.
 *
 * The response is deliberately bare. This is a public URL, and an unauthenticated
 * endpoint that reports the engine, the version or the uptime is a fingerprint
 * handed to whoever asks. The monitor needs the status code; the reason for a
 * failure goes to the log, where the people running the site can see it and
 * nobody else can.
 */

async function getHandler(req: NextRequest) {
  const ip = getClientIp(req);

  // The public budget is 600/minute, which is far above any sane monitor and
  // still bounds an unauthenticated endpoint that touches the database.
  const rl = publicApiRateLimit(ip);
  if (!rl.allowed) return rateLimited(rl, { endpoint: "health", ip });

  try {
    // The smallest question the database can be asked. Not a count, not a table
    // read: this must stay cheap enough to run every few seconds forever.
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.error("health: database unreachable", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }

  return NextResponse.json(
    { status: "ok" },
    // A cached health check reports the health of the cache.
    { headers: { "Cache-Control": "no-store" } },
  );
}

// The one route that does not go through withApiLog. Every other endpoint is
// worth a line in the log; this one is polled every few seconds forever, and
// logging it would bury the requests that matter under 8,000 lines a day of
// "still fine". A failure is still logged — see the catch above.
export const GET = getHandler;
