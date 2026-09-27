/**
 * RASAMAP — the session cookie.
 *
 * The cookie carries an opaque token; what it means is a row in `sessions`
 * (lib/db/sessions.ts). This file only reads and writes the cookie. HttpOnly,
 * SameSite=Lax, and Secure whenever the connection is HTTPS (isSecureRequest).
 */
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_MAX_LIFETIME_MS } from "@/lib/domain/session";

const SESSION_COOKIE = "rasamap_session";

/** The browser keeps the cookie for the absolute lifetime; the row decides sooner. */
const COOKIE_MAX_AGE_SECS = Math.floor(SESSION_MAX_LIFETIME_MS / 1000);

/** This request's session token, from a Server Component or a Route Handler. */
export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Which kind of account the cookie claims to be, for proxy.ts's routing only —
 * whether to send a visitor to the sign-in page or answer 403. It is read from
 * the token's prefix without a database lookup (Next's guidance: proxy does
 * optimistic checks, and runs on every request including prefetches), so it
 * proves nothing. Every page and route resolves the real session itself.
 */
export function sessionHint(req: NextRequest): "customer" | "staff" | null {
  const value = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  return value.startsWith("s.") ? "staff" : value.startsWith("c.") ? "customer" : null;
}

/**
 * Is this request actually travelling over HTTPS?
 *
 * `Secure` used to be attached whenever NODE_ENV was "production" — which
 * `next start` sets, including for `npm run demo` on the laptop. A browser
 * refuses to store a `Secure` cookie received over plain HTTP, so a phone
 * opening the demo at `http://<lan-ip>` signed in and was signed straight out
 * again. Chrome treats `http://localhost` as trustworthy and keeps the cookie
 * there, which is why it went unnoticed. The flag follows the transport:
 * HTTPS directly, or as the terminating proxy reports it.
 */
export function isSecureRequest(req?: NextRequest): boolean {
  if (!req) return process.env.NODE_ENV === "production";
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() === "https";
  return req.nextUrl.protocol === "https:";
}

function cookieHeader(value: string, maxAge: number, req?: NextRequest): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    // Lax, not Strict: Strict withholds the cookie from any navigation that
    // starts on another site, so a signed-in person who opened their dashboard
    // from a messaging app was sent to the sign-in form. Lax still withholds it
    // from every cross-site POST, PATCH and DELETE, and no GET here changes
    // anything.
    "SameSite=Lax",
    ...(isSecureRequest(req) ? ["Secure"] : []),
  ].join("; ");
}

export function sessionCookieHeader(value: string, req?: NextRequest): string {
  return cookieHeader(value, COOKIE_MAX_AGE_SECS, req);
}

export function clearedSessionCookieHeader(req?: NextRequest): string {
  return cookieHeader("", 0, req);
}
