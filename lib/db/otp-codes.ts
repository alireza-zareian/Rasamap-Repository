// One-time codes for sign-up and password reset: 6 digits, 5 minutes, single
// use, 5 attempts. Only an HMAC-SHA256 of the code (keyed by AUTH_SECRET) is
// stored. The purpose is in every lookup, so a reset code cannot open an account.

import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./client";

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
  // Bound the table: drop rows older than a day.
  await prisma.otpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  return code;
}

export type OtpFailure = "not_found" | "expired" | "too_many_attempts" | "mismatch";

export type OtpCheck = { ok: true } | { ok: false; reason: OtpFailure };

/** The refusal each failure shows, shared by both flows. */
const FAILURE_MESSAGE: Record<OtpFailure, string> = {
  not_found:         "کدی برای این شماره پیدا نشد. دوباره درخواست کد بدهید.",
  expired:           "کد منقضی شده است. دوباره درخواست کد بدهید.",
  too_many_attempts: "تعداد تلاش‌ها بیش از حد مجاز است. دوباره درخواست کد بدهید.",
  mismatch:          "کد وارد شده نادرست است.",
};

export function otpErrorMessage(reason: OtpFailure): string {
  return FAILURE_MESSAGE[reason];
}

/** Verify and consume a code. Every attempt, right or wrong, counts toward the cap. */
export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<OtpCheck> {
  const row = await prisma.otpCode.findFirst({
    where: { phone, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  // Claim the attempt before comparing, and only under the cap — otherwise
  // concurrent guesses all read the same count and all get compared.
  const { count: claimed } = await prisma.otpCode.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data:  { attempts: { increment: 1 } },
  });
  if (claimed === 0) return { ok: false, reason: "too_many_attempts" };

  if (!equalHex(row.codeHash, hashCode(code))) return { ok: false, reason: "mismatch" };

  // Conditional on still unconsumed, so two concurrent verifies of one correct
  // code cannot both succeed.
  const { count } = await prisma.otpCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: "not_found" };
  return { ok: true };
}
