import type { NextRequest } from "next/server";

/**
 * The client address, for rate limits and audit rows.
 *
 * TRUSTED_PROXY_COUNT is the number of reverse proxies in front (nginx = 1).
 * Each appends to `X-Forwarded-For`, so the entry that many places from the
 * right is the one a trusted proxy wrote; anything left of it the client wrote.
 *
 * The default, 0, is the demo laptop with no proxy: the address is the TCP
 * peer, which server.mjs writes into `x-rasamap-peer`, replacing any value a
 * client sent. (Plain `next start` has no such header, and falls back to an
 * X-Forwarded-For the caller can set.) Setting 0 behind a proxy is the safe
 * mistake — everyone shares one address; setting 1 without one lets a caller
 * choose theirs, so it must be asked for.
 *
 * No defence rests on the address alone: sign-in is also limited per account
 * and device, and phone reveals per account (lib/rate-limit).
 */
const TRUSTED_PROXIES = Math.max(
  0,
  Number.parseInt(process.env.TRUSTED_PROXY_COUNT ?? "0", 10) || 0,
);

/**
 * Whether the address was observed (the peer, or a trusted proxy's entry)
 * rather than claimed by the caller, so audit rows can mark the difference.
 */
export function isClientIpTrusted(req: NextRequest): boolean {
  // With no proxy, only server.mjs's peer header is an observation.
  if (TRUSTED_PROXIES === 0) return !!req.headers.get("x-rasamap-peer");
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return false;
  // A real chain has at least one entry per trusted hop.
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
