// Next.js startup hook — runs once when the server process boots.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

import type { Instrumentation } from "next";

export async function register() {
  // Node only (Proxy runs on Node in Next 16; nothing here uses the Edge runtime).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }
}

/**
 * A page's render error reaches app/error.tsx with Next's `digest` — the
 * reference the visitor sees. API routes log their own (serverError in
 * lib/http/responses.ts); this logs the digest for pages, so a reference a
 * visitor quotes can be found in the log.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("./lib/logger");
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err
    ? String((err as { digest?: unknown }).digest)
    : undefined;
  logger.error("request_error", {
    digest,
    message,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
  });
};
