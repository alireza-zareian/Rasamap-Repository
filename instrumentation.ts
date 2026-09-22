// Next.js startup hook — runs once when the server process boots.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

import type { Instrumentation } from "next";

export async function register() {
  // Node runtime only — skip on the Edge runtime (proxy.ts), which has no
  // access to the full server env and does not need this check.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }
}

/**
 * API routes already log their own errors with a searchable `ref` through
 * withApiLog/serverError (lib/api-log.ts, lib/api-error.ts) — that ref is
 * also what app/error.tsx would show, except it never had one. A page that
 * reads the DB directly (app/billboard/[slug]/page.tsx, for one) has no
 * try/catch, so its errors reached app/error.tsx showing only Next's own
 * `error.digest`, which is a different id that never touches logs/app.log —
 * a support ticket quoting it was a dead end. This is Next's own hook for
 * exactly that gap: log the digest here so it is grep-able against the
 * value the user is actually shown.
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
