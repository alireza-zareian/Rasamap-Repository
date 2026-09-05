import type { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { serverError } from "@/lib/api-error";

/**
 * Next signals control flow by throwing: `redirect()`, `notFound()`, and the
 * DynamicServerError the build throws when a route reads `request.headers`
 * while it is being probed for static rendering. Every one of these carries a
 * string `digest` ("NEXT_REDIRECT", "NEXT_HTTP_ERROR_FALLBACK",
 * "DYNAMIC_SERVER_USAGE"), which is the one precondition all three of Next's
 * own guards check — so the digest is the stable contract to test, rather than
 * importing from `next/dist/client/components/*`, which is private and moves
 * between versions.
 *
 * These must reach the framework untouched. Catching the DynamicServerError
 * and answering it with a 500 told the build that a dynamic route had failed
 * rather than that it was dynamic, and wrote a fake error to the log with a
 * reference id no user would ever quote.
 */
function isFrameworkSignal(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest: unknown }).digest === "string"
  );
}

/**
 * Wrap a route handler so every call emits one structured `api_request` log
 * line: method, path, status, duration. Nothing about the body, query string,
 * headers, or user identity beyond an id is logged.
 *
 * The wrapper is also the last line of defence for an unforeseen throw. A
 * handler that catches its own failure has already returned a response and
 * never reaches the `catch` here; anything that does get this far would
 * otherwise surface as the framework's bare 500 with no Persian message and
 * no reference id, which is the one outcome audit §5 rules out. Routing it
 * through `serverError` keeps the stack in the log and gives the caller the
 * same calm message and quotable id as every hand-written catch.
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
      if (isFrameworkSignal(err)) throw err;
      status = 500;
      return serverError(`${req.method} /api/${name}`, err);
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
