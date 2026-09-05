// Shared helpers for the API test suite.
// No test framework dependency — uses Node's built-in `node:test` + `fetch`.

import { SignJWT } from "jose";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

// A browser-ish UA so proxy.ts / route bot-UA filters don't drop the request.
const UA = "Mozilla/5.0 (rasamap-test-suite)";

// Fail a stuck request in seconds rather than inheriting undici's 300 s header
// timeout. A wedged server used to burn five minutes per call and then cascade
// into a wall of unrelated failures, which hid what had actually broken. The
// slowest legitimate call here is a bcrypt round at roughly one second.
const REQUEST_TIMEOUT_MS = 30_000;

let ipCounter = 0;
/** Unique-ish private IP per call so in-memory rate-limit buckets don't collide across tests. */
export function uniqueIp() {
  ipCounter += 1;
  const n = ipCounter;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

/** Mint a valid session JWT signed with the same AUTH_SECRET the server uses. */
export async function mintSession({ userId = "1", email = "tester", name = "Tester", role = "user" } = {}) {
  return new SignJWT({ userId, email, name, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET);
}

/**
 * Call an API route.
 * @returns {{ status:number, json:any, headers:Headers }}
 */
export async function api(path, { method = "GET", body, token, ip, headers = {} } = {}) {
  const h = { "user-agent": UA, "x-forwarded-for": ip || uniqueIp(), ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (token) h["cookie"] = `rasamap_session=${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

/** Extract the session token from a Set-Cookie response header. */
export function tokenFromSetCookie(res) {
  const cookies = res.headers.getSetCookie?.() ?? [];
  for (const c of cookies) {
    const m = /(?:^|[;,\s])rasamap_session=([^;]+)/.exec(c);
    if (m && m[1]) return m[1];
  }
  return null;
}

/**
 * The smallest valid PNG (1x1, transparent) as a data URL — a real file with a
 * real PNG signature, so the server's magic-byte check accepts it.
 */
export function pngDataUrl() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" +
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  return `data:image/png;base64,${base64}`;
}

/**
 * A payload that *claims* to be a PNG but whose bytes are something else — the
 * shape of an upload trying to smuggle a non-image past an extension check.
 */
export function fakeImageDataUrl() {
  const evil = Buffer.from("MZ\x90\x00\x03 this is not an image at all").toString("base64");
  return `data:image/png;base64,${evil}`;
}

/** Random valid Iranian mobile number for register tests. */
export function randomPhone() {
  return "0912" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
}

/**
 * Recover the one-time code that `POST /api/auth/otp/send` just issued.
 *
 * The server never stores the code — only an HMAC-SHA256 of it keyed by
 * AUTH_SECRET (lib/otp.ts) — so there is nothing to read back. The route can
 * echo the code when OTP_DEV_ECHO=1, but that affordance is also gated on
 * NODE_ENV so it can never arm on a real deployment, and the suite runs
 * against a production build. Rather than weaken that guard for the
 * convenience of a test, this walks the six-digit space against the stored
 * hash: one second at worst, and it proves the flow using only what a real
 * client would receive by SMS.
 */
export async function recoverOtpCode(phone, purpose = "password_reset") {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const row = await prisma.otpCode.findFirst({
      where: { phone, purpose, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    const secret = process.env.AUTH_SECRET ?? "";
    for (let i = 0; i < 1_000_000; i++) {
      const code = String(i).padStart(6, "0");
      if (createHmac("sha256", secret).update(code).digest("hex") === row.codeHash) return code;
    }
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

/** How many unconsumed codes exist for a phone — used to prove none was issued. */
export async function countOtpRows(phone, purpose = "password_reset") {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    return await prisma.otpCode.count({ where: { phone, purpose } });
  } finally {
    await prisma.$disconnect();
  }
}
