/**
 * RASAMAP — Session Management
 * Uses signed JWT stored in an HttpOnly, Secure, SameSite=Strict cookie.
 * Never expose raw tokens to client JS.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "rasamap_session";
const MAX_AGE_SECS  = 60 * 60 * 8; // 8 hours

export type UserRole = "super_admin" | "admin" | "editor" | "viewer" | "user";

export interface SessionPayload extends JWTPayload {
  userId: string;
  email:  string;
  role:   UserRole;
  name:   string;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET env var must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: Omit<SessionPayload, "iat" | "exp">): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECS}s`)
    .sign(getSecret());
  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Read session from server-side cookies (Server Components / Route Handlers) */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Read session from an incoming NextRequest (Middleware) */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/**
 * Is this request actually travelling over HTTPS?
 *
 * `Secure` used to be attached whenever NODE_ENV was "production" — which
 * `next start` sets, including for `npm run demo` on the laptop. A browser
 * refuses to store a `Secure` cookie received over plain HTTP, so a phone
 * opening the demo at `http://<lan-ip>` logged in successfully and was
 * immediately logged out again: the cookie was thrown away on arrival. It went
 * unnoticed because Chrome treats `http://localhost` as a trustworthy origin
 * and keeps the cookie there.
 *
 * The flag belongs on the property it actually describes — the transport — so
 * it is set when the connection is HTTPS (directly, or as reported by the
 * terminating proxy) and omitted when it is not, where it would only prevent
 * the cookie from being stored without protecting anything.
 */
export function isSecureRequest(req?: NextRequest): boolean {
  if (!req) return process.env.NODE_ENV === "production";
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() === "https";
  return req.nextUrl.protocol === "https:";
}

function cookieFlags(value: string, maxAge: number, req?: NextRequest): string {
  return [
    `${SESSION_COOKIE}=${value}`,
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    ...(isSecureRequest(req) ? ["Secure"] : []),
  ].join("; ");
}

/** Write session cookie — called after successful login */
export function buildSessionCookieHeader(token: string, req?: NextRequest): string {
  return cookieFlags(token, MAX_AGE_SECS, req);
}

/** Expire the session cookie (secure logout) */
export function buildLogoutCookieHeader(req?: NextRequest): string {
  return cookieFlags("", 0, req);
}
