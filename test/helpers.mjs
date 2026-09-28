// Shared helpers for the API test suite.
// No test framework dependency — uses Node's built-in `node:test` + `fetch`.

import { createHash, createHmac, randomBytes } from "node:crypto";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

export const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";

// A browser-ish UA so proxy.ts / route bot-UA filters don't drop the request.
const UA = "Mozilla/5.0 (rasamap-test-suite)";

// Fail a stuck request well before undici's 300 s header timeout, which let a
// wedged server cascade into unrelated failures. The slowest real call is a
// bcrypt round, about a second.
const REQUEST_TIMEOUT_MS = 30_000;

let ipCounter = 0;
/** Unique-ish private IP per call so in-memory rate-limit buckets don't collide across tests. */
export function uniqueIp() {
  ipCounter += 1;
  const n = ipCounter;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
}

/**
 * The staff row each role's session names, seeded by test/seed.mjs: the server
 * reads that row on every request.
 */
const STAFF_IDS = { viewer: "9001", editor: "9002", admin: "9003", super_admin: "9004" };

let db;
/** One client for the helpers that write fixtures straight into the store. */
function store() {
  db ??= new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });
  return db;
}

/**
 * Open a session the way a sign-in does (lib/db/sessions.ts): a random token
 * in the cookie, its SHA-256 as the row's id. `role: "user"` means a customer;
 * any other role is a staff member. `signedInAt` backdates the sign-in, for the
 * absolute-lifetime test; `idleLeftMs` sets how long until the idle limit.
 */
export async function mintSession({ userId, role = "user", signedInAt, idleLeftMs = 60 * 60 * 1000 } = {}) {
  userId ??= STAFF_IDS[role] ?? "1";
  const kind = role === "user" ? "customer" : "staff";
  const value = `${kind === "staff" ? "s" : "c"}.${randomBytes(32).toString("base64url")}`;
  await store().session.create({
    data: {
      id: createHash("sha256").update(value).digest("hex"),
      kind,
      userId:  kind === "customer" ? Number(userId) : null,
      adminId: kind === "staff" ? Number(userId) : null,
      ...(signedInAt ? { createdAt: signedInAt } : {}),
      expiresAt: new Date(Date.now() + idleLeftMs),
    },
  });
  return value;
}

/** The idle limit of the session behind a cookie value, as the store has it. */
export async function sessionExpiry(value) {
  const row = await store().session.findUnique({ where: { id: createHash("sha256").update(value).digest("hex") } });
  return row?.expiresAt ?? null;
}

/**
 * Call an API route.
 * @param {object} [opts]
 * @param {"follow"|"manual"} [opts.redirect] "manual" to read the redirect
 *   itself rather than what it points at — the only way to tell a 307 to the
 *   sign-in page from a 403 refusal, since following one turns it into a 200.
 * @returns {{ status:number, json:any, headers:Headers }}
 */
export async function api(path, { method = "GET", body, form, token, ip, headers = {}, redirect = "follow" } = {}) {
  const h = { "user-agent": UA, "x-forwarded-for": ip || uniqueIp(), ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (token) h["cookie"] = `rasamap_session=${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers: h,
    redirect,
    body: form !== undefined ? toFormData(form)
      : body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
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

/**
 * A multipart body from a plain object, the way the pages build one
 * (lib/client/photos.ts): an array becomes the field repeated, in order, and a
 * File is sent as a file.
 */
function toFormData(fields) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      fd.append(key, v instanceof Blob ? v : String(v));
    }
  }
  return fd;
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
 * The smallest valid PNG (1x1, transparent) — a real file with a real PNG
 * signature, so the server's magic-byte check accepts it.
 */
export function pngFile() {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" +
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  return new File([bytes], "pixel.png", { type: "image/png" });
}

/**
 * A PNG whose header declares 20000 × 20000 pixels — the shape of a small file
 * that decodes to 1.6 GB. The server reads only the header, so no pixels follow.
 */
export function hugePngFile() {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "ascii");
  ihdr.writeUInt32BE(20000, 8);
  ihdr.writeUInt32BE(20000, 12);
  ihdr[16] = 8; ihdr[17] = 2;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([Buffer.concat([signature, ihdr, Buffer.alloc(64)])], "huge.png", { type: "image/png" });
}

/**
 * A file that *claims* to be a PNG but whose bytes are something else — the
 * shape of an upload trying to smuggle a non-image past an extension check.
 */
export function fakeImageFile() {
  return new File([Buffer.from("MZ\x90\x00\x03 this is not an image at all")], "evil.png", { type: "image/png" });
}

/** Where the server under test writes uploads (test/run.mjs sets UPLOAD_DIR). */
export function uploadPath(url) {
  return join(process.env.UPLOAD_DIR, url.slice("/uploads/".length));
}

/** Random valid Iranian mobile number for register tests. */
export function randomPhone() {
  return "0912" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
}

/**
 * Recover the one-time code that `POST /api/auth/otp/send` just issued. Only
 * an HMAC-SHA256 of it is stored (lib/db/otp-codes.ts) and the runners turn
 * OTP_DEV_ECHO off, so this walks the six-digit space against the hash — about
 * a second at worst.
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

/**
 * Open an account the way the sign-up screen does: a code on the number, read
 * back, then register. Returns the register response.
 */
export async function registerUser({ name = "Test User", phone, password = "secret123", ip, headers } = {}) {
  const send = await api("/api/auth/otp/send", { method: "POST", ip, headers, body: { phone, purpose: "register" } });
  if (send.status !== 200) return send;
  const code = await recoverOtpCode(phone, "register");
  return api("/api/auth/register", { method: "POST", ip, headers, body: { name, phone, password, code } });
}

/**
 * A new customer written straight to the database, with a session. Listing
 * submissions are limited per account, so each submitting test gets its own;
 * sign-up would cost a bcrypt round and an OTP search each.
 */
export async function freshCustomer() {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    for (;;) {
      const phone = randomPhone();
      try {
        const user = await prisma.user.create({ data: { name: "Fresh Customer", phone, passwordHash: "x" } });
        return mintSession({ userId: String(user.id), role: "user" });
      } catch (err) {
        if (err?.code !== "P2002") throw err; // a phone collision: draw another
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

export async function countOtpRows(phone, purpose = "password_reset") {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    return await prisma.otpCode.count({ where: { phone, purpose } });
  } finally {
    await prisma.$disconnect();
  }
}

/** The stored size of a billboard, `area` included — the API never returns it. */
export async function storedSize(id) {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    return await prisma.billboard.findUnique({ where: { id }, select: { width: true, height: true, area: true } });
  } finally {
    await prisma.$disconnect();
  }
}
