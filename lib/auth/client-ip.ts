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
 *
 * ── The limit of that defence, said out loud ────────────────────────────────
 *
 * Taking the entry from the right works because each proxy *appends* the
 * address it actually saw, so a forged value is pushed leftwards out of the
 * position being read. **That is conditional on a proxy really being there.**
 * With nothing in front, nothing is appended and a forged header is the whole
 * chain — so the value returned here is simply whatever the caller chose.
 *
 * Next.js fills this header from the socket when it is absent
 * (`req.headers['x-forwarded-for'] ??= …socket.remoteAddress` in
 * base-server.js), but `??=` means "only if absent": a caller who sends the
 * header keeps it, and nothing downstream can tell the two cases apart.
 *
 * The consequences are recorded in card B1 of docs/roadmap.html, and they are
 * the reason **no protection in this codebase rests on the address alone**:
 * sign-in is limited per account as well (see credentialAttempt in
 * ./rate-limit.ts), which no header can move a caller off. Run behind the nginx
 * config in deploy/ for the address to mean anything at all.
 */
const TRUSTED_PROXIES = Math.max(
  0,
  Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? "1", 10) || 0,
);

/**
 * Whether the address came from a proxy we actually trust.
 *
 * An audit row saying `ip: 198.51.100.5` reads as an observation, and behind a
 * proxy it is one. Without a proxy it is a claim the subject of the audit made
 * about itself. The two should not look identical to whoever reads the log
 * afterwards, so callers that record evidence mark the difference.
 */
export function isClientIpTrusted(req: NextRequest): boolean {
  if (TRUSTED_PROXIES === 0) return false;
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return false;
  // A genuine chain carries at least one entry per trusted hop. Fewer means the
  // header did not come through the proxy chain this deployment expects.
  return xff.split(",").filter((p) => p.trim()).length >= TRUSTED_PROXIES;
}

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
