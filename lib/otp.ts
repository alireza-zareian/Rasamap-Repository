// One-time code lifecycle for phone-verified flows: password reset and sign-up.
// The code is never stored — only an HMAC-SHA256 hash keyed by AUTH_SECRET.
// Codes are 6 digits, valid 5 minutes, single-use, and capped at 5 attempts.
//
// The purpose is part of every lookup, so a code issued to reset a password can
// never be spent to open an account, and the two flows cannot share a row.

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpPurpose = "password_reset" | "register";

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

export type OtpFailure = "not_found" | "expired" | "too_many_attempts" | "mismatch";

export type OtpCheck = { ok: true } | { ok: false; reason: OtpFailure };

/** What to show someone whose code was refused. Both flows say the same thing,
 *  so the sentences live with the check that produces them. */
const FAILURE_MESSAGE: Record<OtpFailure, string> = {
  not_found:         "کدی برای این شماره پیدا نشد. دوباره درخواست کد بدهید.",
  expired:           "کد منقضی شده است. دوباره درخواست کد بدهید.",
  too_many_attempts: "تعداد تلاش‌ها بیش از حد مجاز است. دوباره درخواست کد بدهید.",
  mismatch:          "کد وارد شده نادرست است.",
};

export function otpErrorMessage(reason: OtpFailure): string {
  return FAILURE_MESSAGE[reason];
}

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

  // Consumption is conditional on the row still being unconsumed, not a bare
  // update, so two concurrent verifies with the same correct code (a
  // double-submit, a retried request) cannot both succeed — the second finds
  // count === 0 and is treated as already-spent rather than authorizing a
  // second password write.
  const { count } = await prisma.otpCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}
