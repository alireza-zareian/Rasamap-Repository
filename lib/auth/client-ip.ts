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
 * With 0, the address is the TCP peer. `npm run demo` runs server.mjs, which
 * writes it into `x-rasamap-peer` on every request and overwrites any value a
 * client sent under that name — the one address here a caller cannot choose.
 * Under plain `next start` that header is absent, and the fallback is the
 * X-Forwarded-For entry Next fills from the socket (`??=` in base-server.js),
 * which a caller *can* choose by sending the header itself.
 *
 * Earlier, 0 read `x-real-ip`, which nothing sets: every demo visitor was
 * "unknown" and shared one budget (reproduced against `npm run demo`).
 *
 * No protection rests on the address alone: sign-in is limited per account and
 * device, phone reveals per account (lib/rate-limit).
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
  // With no proxy, only server.mjs's peer header is an observation.
  if (TRUSTED_PROXIES === 0) return !!req.headers.get("x-rasamap-peer");
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return false;
  // A genuine chain carries at least one entry per trusted hop. Fewer means the
  // header did not come through the proxy chain this deployment expects.
  return xff.split(",").filter((p) => p.trim()).length >= TRUSTED_PROXIES;
}

export function getClientIp(req: NextRequest): string {
  if (TRUSTED_PROXIES === 0) {
    const peer = req.headers.get("x-rasamap-peer")?.trim();
    if (peer) return peer;
  }
  const parts = (req.headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "unknown";
  // With no proxy the rightmost entry is the one Next wrote from the socket;
  // with N proxies it is the one the outermost of them appended.
  const idx = Math.max(0, parts.length - Math.max(1, TRUSTED_PROXIES));
  return parts[idx];
}

/**
 * Loopback, link-local or a private LAN range (RFC 1918, IPv6 ULA), with the
 * IPv4-mapped IPv6 form Node reports for an IPv4 peer (`::ffff:192.168.1.5`).
 */
export function isPrivateAddress(addr: string): boolean {
  const a = addr.trim().toLowerCase().replace(/^::ffff:/, "");
  if (a === "localhost" || a === "::1") return true;
  if (/^(127|10)\./.test(a) || /^192\.168\./.test(a) || /^169\.254\./.test(a)) return true;
  const m = /^172\.(\d+)\./.exec(a);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return /^f[cd][0-9a-f]{2}:/.test(a) || /^fe80:/.test(a);
}

/**
 * Whether this request is a local-network visit: the address the browser used
 * (Host, as the browser sent it — never nextUrl, rule 9) and the peer are both
 * private. True on the demo laptop, over localhost or from a phone on its
 * Wi-Fi; false for anyone reaching a public domain or a public IP.
 */
export function isLocalNetworkRequest(req: NextRequest, ip: string): boolean {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim();
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.replace(/:\d+$/, "");
  return isPrivateAddress(hostname) && isPrivateAddress(ip);
}

/** The machine itself: 127.0.0.0/8 or ::1, as the peer address reports it. */
export function isLoopbackAddress(addr: string): boolean {
  const a = addr.trim().toLowerCase().replace(/^::ffff:/, "");
  return a === "::1" || /^127\./.test(a);
}
