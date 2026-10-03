import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { authSecret } from "@/lib/env";
import { isSecureRequest } from "./session";

/**
 * A "this browser has signed in to this account before" cookie (OWASP's
 * device cookies). An account lockout stops a guesser, but also lets anyone who
 * knows an email lock its owner out. A browser that has signed in to the account
 * keeps a signed token naming it, and its attempts count on a budget of their
 * own; every other browser shares the account's.
 *
 * Up to MAX_ACCOUNTS accounts per browser (a shared office machine). Not
 * covered: the owner on a new device during an attack is still locked out, and
 * a stolen cookie gives its thief the owner's budget — but no password.
 */

const DEVICE_COOKIE = "rasamap_device";
const MAX_AGE_SECS = 60 * 60 * 24 * 365;
const MAX_ACCOUNTS = 5;

type Entry = { acct: string; id: string };

function secret(): Uint8Array {
  return new TextEncoder().encode(`${authSecret()}:device`);
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
