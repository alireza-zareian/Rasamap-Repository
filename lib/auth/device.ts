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
 * One browser remembers up to MAX_ACCOUNTS accounts — a shared office machine,
 * or a staff member who also has a customer account — so signing in to a
 * second one does not make the first a stranger again.
 *
 * Not covered: the owner on a brand-new device while an attack is running is
 * still locked out, and a stolen device cookie buys its thief the owner's
 * budget (five tries per lockout, no password).
 */

const DEVICE_COOKIE = "rasamap_device";
const MAX_AGE_SECS = 60 * 60 * 24 * 365;
const MAX_ACCOUNTS = 5;

type Entry = { acct: string; id: string };

function secret(): Uint8Array {
  return new TextEncoder().encode(`${process.env.AUTH_SECRET ?? ""}:device`);
}

/** The account as the cookie names it: a hash, so the cookie never carries the email or phone. */
function accountRef(identifier: string): string {
  return createHash("sha256").update(identifier.trim().toLowerCase()).digest("base64url");
}

/** The accounts this browser's cookie vouches for, or none if it does not verify. */
async function entries(req: NextRequest): Promise<Entry[]> {
  const token = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!token) return [];
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const list = payload.devices;
    if (!Array.isArray(list)) return [];
    return list.filter((e): e is Entry =>
      typeof e === "object" && e !== null && typeof e.acct === "string" && typeof e.id === "string");
  } catch {
    return [];
  }
}

/**
 * The id of this browser's device entry for `identifier`, or null when it has
 * none or the cookie does not verify.
 */
export async function knownDevice(req: NextRequest, identifier: string): Promise<string | null> {
  const acct = accountRef(identifier);
  return (await entries(req)).find(e => e.acct === acct)?.id ?? null;
}

/** Remember `identifier` on this browser, after a successful sign-in. */
export async function rememberDevice(res: NextResponse, req: NextRequest, identifier: string): Promise<void> {
  const acct = accountRef(identifier);
  const others = (await entries(req)).filter(e => e.acct !== acct);
  const devices = [...others, { acct, id: randomUUID() }].slice(-MAX_ACCOUNTS);
  const token = await new SignJWT({ devices })
    .setProtectedHeader({ alg: "HS256" })
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
