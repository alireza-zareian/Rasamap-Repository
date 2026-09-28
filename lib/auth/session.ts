/**
 * The session cookie: an opaque token whose meaning is a row in `sessions`
 * (lib/db/sessions.ts). HttpOnly, SameSite=Lax, Secure over HTTPS.
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
 * The kind of account the cookie claims, from its prefix, for proxy.ts's
 * routing only (sign-in page or 403). No database read, so it proves nothing;
 * every page and route resolves the real session.
 */
export function sessionHint(req: NextRequest): "customer" | "staff" | null {
  const value = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  return value.startsWith("s.") ? "staff" : value.startsWith("c.") ? "customer" : null;
}

/**
 * Whether this request travels over HTTPS, directly or as the proxy reports.
 * Never from NODE_ENV: the demo runs production over plain HTTP, and a phone
 * at `http://<lan-ip>` drops a Secure cookie (rule 9, §24). Without a request
 * there is nothing to read, and NODE_ENV is the only guess left.
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
    // Lax: Strict dropped the cookie on a link from a messaging app. Lax still
    // withholds it from cross-site writes, and no GET here changes anything.
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
