// One-time code lifecycle for phone-verified flows (currently: password reset).
// The code is never stored — only an HMAC-SHA256 hash keyed by AUTH_SECRET.
// Codes are 6 digits, valid 5 minutes, single-use, and capped at 5 attempts.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpPurpose = "password_reset";

function hashCode(code: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(code).digest("hex");
}

function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Create a fresh code, invalidating any earlier unconsumed one for this pair. */
export async function issueOtp(phone: string, purpose: OtpPurpose): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.otpCode.deleteMany({ where: { phone, purpose, consumedAt: null } });
  await prisma.otpCode.create({
    data: { phone, purpose, codeHash: hashCode(code), expiresAt: new Date(Date.now() + TTL_MS) },
  });
  // Opportunistic prune of old rows so the table can't grow unbounded.
  await prisma.otpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  return code;
}

export type OtpCheck =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "mismatch" };

/** Verify and consume a code. A wrong code increments the attempt counter. */
export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<OtpCheck> {
  const row = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  if (!equalHex(row.codeHash, hashCode(code))) {
    await prisma.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: "mismatch" };
  }

  await prisma.otpCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}
