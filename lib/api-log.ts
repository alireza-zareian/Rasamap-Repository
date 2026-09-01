import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Wrap a route handler so every call emits one structured `api_request` log
 * line: method, path, status, duration. Nothing about the body, query string,
 * headers, or user identity beyond an id is logged.
 *
 * Next.js route handlers run in the Node runtime, so `lib/logger` (which may
 * write to a rotating file) is safe to use here — unlike `proxy.ts`, which
 * runs on the edge.
 *
 *   export const GET = withApiLog("billboards", async (req) => { ... });
 */
export function withApiLog<C = unknown>(
  name: string,
  handler: (req: NextRequest, ctx: C) => Promise<Response>,
): (req: NextRequest, ctx: C) => Promise<Response> {
  return async (req, ctx) => {
    const start = performance.now();
    let status = 0;
    try {
      const res = await handler(req, ctx);
      status = res.status;
      return res;
    } catch (err) {
      status = 500;
      throw err;
    } finally {
      logger.info("api_request", {
        route: name,
        method: req.method,
        path: new URL(req.url).pathname,
        status,
        ms: Math.round(performance.now() - start),
      });
    }
  };
}
