import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { isSecureRequest } from "./session";

/**
 * A "this browser has signed in to this account before" cookie.
 *
 * Locking an account after five wrong passwords stops a guesser, and hands
 * anyone who knows an address a way to lock its owner out: five requests, and
 * the super admin cannot reach the panel for a quarter of an hour, again and
 * again. The device cookie is the usual answer to that (OWASP's "device
 * cookies"). A browser that signed in to an account successfully keeps a
 * signed token naming the account; its attempts are counted on a budget of its
 * own, so a lockout run up by strangers never reaches it. A browser without
 * one — the attacker, or the owner on a machine they have never used — shares
 * the account-wide budget as before.
 *
 * Not covered: the owner on a brand-new device while an attack is running is
 * still locked out, and a stolen device cookie buys its thief the owner's
 * budget (five tries per lockout, no password).
 */

const DEVICE_COOKIE = "rasamap_device";
const MAX_AGE_SECS = 60 * 60 * 24 * 365;

function secret(): Uint8Array {
  return new TextEncoder().encode(`${process.env.AUTH_SECRET ?? ""}:device`);
}

/** The account as the cookie names it: a hash, so the cookie never carries the email or phone. */
function accountRef(identifier: string): string {
  return createHash("sha256").update(identifier.trim().toLowerCase()).digest("base64url");
}

/**
 * The id of this browser's device token for `identifier`, or null when it has
 * none, it names another account, or it does not verify.
 */
export async function knownDevice(req: NextRequest, identifier: string): Promise<string | null> {
  const token = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.acct === accountRef(identifier) && typeof payload.jti === "string" ? payload.jti : null;
  } catch {
    return null;
  }
}

/** Hand this browser a device token for `identifier`, after a successful sign-in. */
export async function rememberDevice(res: NextResponse, req: NextRequest, identifier: string): Promise<void> {
  const token = await new SignJWT({ acct: accountRef(identifier) })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECS}s`)
    .sign(secret());
  res.headers.append("Set-Cookie", [
    `${DEVICE_COOKIE}=${token}`,
    `Max-Age=${MAX_AGE_SECS}`,
    // Only the sign-in routes read it.
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    ...(isSecureRequest(req) ? ["Secure"] : []),
  ].join("; "));
}
