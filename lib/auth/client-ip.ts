import type { NextRequest } from "next/server";

/**
 * Best-effort client IP for rate limiting and audit logs.
 *
 * `X-Forwarded-For` is `client, proxy1, proxy2, …`, each proxy appending the
 * address it saw. The leftmost value is whatever the client wrote, so the one
 * worth reading is the entry the outermost *trusted* proxy appended,
 * `TRUSTED_PROXY_COUNT` positions from the right.
 *
 * TRUSTED_PROXY_COUNT — reverse proxies in front of the app (nginx = 1,
 * Cloudflare + nginx = 2). Default 1. 0 means `next start` is reached directly,
 * which is the demo laptop.
 *
 * With 0, the address comes from Next itself: when a request arrives without
 * the header, Next fills it from the socket
 * (`req.headers['x-forwarded-for'] ??= …socket.remoteAddress` in
 * base-server.js). That is the real peer, and it is read here. This used to
 * ignore the header at 0 and read `x-real-ip` instead, which nothing sets —
 * so every visitor was "unknown" and a whole room shared one budget, while a
 * caller could still pick any address by sending that header (both reproduced
 * against `npm run demo`).
 *
 * ── The limit of this, said out loud ─────────────────────────────────────────
 *
 * `??=` means "only if absent". Without a proxy, a caller who sends the header
 * keeps it, so the value is then a claim rather than an observation, and
 * nothing downstream can tell the two apart (isClientIpTrusted() says false).
 * No protection here rests on the address alone: sign-in is limited per
 * account and phone reveals per account (lib/rate-limit). Put the nginx config
 * in deploy/ in front of a public server for the address to mean more.
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
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "unknown";
  // With no proxy the rightmost entry is the one Next wrote from the socket;
  // with N proxies it is the one the outermost of them appended.
  const idx = Math.max(0, parts.length - Math.max(1, TRUSTED_PROXIES));
  return parts[idx];
}
