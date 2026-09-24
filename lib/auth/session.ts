/**
 * RASAMAP — Session Management
 * Uses signed JWT stored in an HttpOnly, SameSite=Strict cookie (Secure over
 * HTTPS — see isSecureRequest). Never expose raw tokens to client JS.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { STAFF_ROLES } from "@/lib/domain/roles";

const SESSION_COOKIE = "rasamap_session";
const MAX_AGE_SECS  = 60 * 60 * 8; // 8 hours

/**
 * What a session token asserts, as two kinds of account rather than one.
 *
 * Customers and staff live in different tables (`users`, `admins`) with
 * overlapping ids, so "user 7" means nothing until you know which table. The
 * token used to carry a bare `userId` plus a `role` in which "user" meant
 * customer and anything else meant staff — so every caller had to decode the
 * table from the role, and one that forgot wrote a staff id into a customer
 * foreign key (a staff session could submit a listing that was then attributed
 * to whichever customer happened to share the number). `kind` makes the table
 * part of the identity, and the type system makes every caller say which one
 * it wants.
 */
const ClaimsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind:  z.literal("customer"),
    sub:   z.string().regex(/^\d+$/),
    name:  z.string(),
    phone: z.string(),
  }),
  z.object({
    kind:  z.literal("staff"),
    sub:   z.string().regex(/^\d+$/),
    name:  z.string(),
    email: z.string(),
    role:  z.enum(STAFF_ROLES),
  }),
]);

export type SessionClaims = z.infer<typeof ClaimsSchema>;

/** A verified token: its claims plus the expiry the sliding refresh reads. */
export type Session = SessionClaims & { exp: number };

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET env var must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECS}s`)
    .sign(getSecret());
}

/**
 * A token is trusted only if its signature holds *and* its claims have the
 * shape above. The signature proves we issued it; the shape check is what
 * turns a token minted before this format — or by a future version with a
 * field renamed — into "signed out" instead of an object whose missing field
 * surfaces three calls later as `NaN`.
 */
export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const claims = ClaimsSchema.safeParse(payload);
    if (!claims.success || typeof payload.exp !== "number") return null;
    return { ...claims.data, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Read session from server-side cookies (Server Components / Route Handlers) */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Read session from an incoming NextRequest (proxy.ts) */
export async function getSessionFromRequest(req: NextRequest): Promise<Session | null> {
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
