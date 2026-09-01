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

/** Write session cookie — called after successful login */
export function buildSessionCookieHeader(token: string): string {
  const flags = [
    `${SESSION_COOKIE}=${token}`,
    `Max-Age=${MAX_AGE_SECS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ];
  return flags.join("; ");
}

/** Expire the session cookie (secure logout) */
export function buildLogoutCookieHeader(): string {
  return [
    `${SESSION_COOKIE}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
}
