// Shared helpers for the API test suite.
// No test framework dependency — uses Node's built-in `node:test` + `fetch`.

import { SignJWT } from "jose";

export const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

// A browser-ish UA so proxy.ts / route bot-UA filters don't drop the request.
const UA = "Mozilla/5.0 (rasamap-test-suite)";

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
