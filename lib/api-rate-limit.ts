// One place to turn a failed rate-limit check into a response: a 429 with a
// `Retry-After` header and a Persian message that tells the user how long to
// wait, plus an audit trail. Every lockout writes exactly one durable
// `rate_limit_hit` row (on the call that trips it); the repeated 429s that
// follow are only counted in the in-memory log, so a burst cannot flood the
// audit table.

import { NextResponse } from "next/server";
import { retryAfterSeconds, type RateLimitResult } from "@/lib/auth/rate-limit";
import { auditLog, persistAudit } from "@/lib/auth/audit";

export function rateLimited(
  rl: RateLimitResult,
  ctx: { endpoint: string; ip: string; userId?: string | null; userEmail?: string | null },
): NextResponse {
  const retryAfter = retryAfterSeconds(rl);
  const mins = Math.ceil(retryAfter / 60);
  const message =
    mins > 1
      ? `درخواست‌های زیادی فرستاده شده. لطفاً حدود ${mins.toLocaleString("fa-IR")} دقیقه دیگر دوباره تلاش کنید.`
      : "درخواست‌های زیادی فرستاده شده. لطفاً یک دقیقه دیگر دوباره تلاش کنید.";

  const details = { endpoint: ctx.endpoint, retryAfter, lockedUntil: rl.lockedUntil ?? null };

  if (rl.justLocked) {
    // The request that actually triggered the lockout — keep one durable record.
    void persistAudit({
      action: "rate_limit_hit",
      severity: "warn",
      userEmail: ctx.userEmail ?? null,
      ip: ctx.ip,
      details: { ...details, userId: ctx.userId ?? null },
    });
  } else {
    // Subsequent rejections while already locked — memory-only, no DB row.
    auditLog("rate_limit_hit", "warn", { ip: ctx.ip, userId: ctx.userId ?? undefined, details });
  }

  return NextResponse.json(
    { error: message, retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
