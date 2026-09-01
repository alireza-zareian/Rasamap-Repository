import type { NextRequest } from "next/server";

/**
 * Best-effort client IP for rate limiting and audit logs.
 *
 * `X-Forwarded-For` is `client, proxy1, proxy2, …`. The leftmost value is
 * set by the client and is trivially spoofable — taking it (`.split(",")[0]`)
 * lets a caller send a fresh fake IP on every request and dodge a per-IP
 * limit. Instead we take the entry the outermost *trusted* proxy actually
 * observed, `TRUSTED_PROXY_COUNT` positions from the right.
 *
 * TRUSTED_PROXY_COUNT — number of reverse proxies in front of the app
 * (nginx = 1, Cloudflare + nginx = 2). Default 1. Set 0 only when the app is
 * exposed directly with no proxy, in which case `X-Forwarded-For` is ignored
 * entirely and `x-real-ip` (or "unknown") is used.
 */
const TRUSTED_PROXIES = Math.max(
  0,
  Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? "1", 10) || 0,
);

export function getClientIp(req: NextRequest): string {
  if (TRUSTED_PROXIES > 0) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        const idx = Math.min(
          parts.length - 1,
          Math.max(0, parts.length - TRUSTED_PROXIES),
        );
        return parts[idx];
      }
    }
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
