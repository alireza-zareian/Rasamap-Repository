import "server-only";
import { NextResponse } from "next/server";
import { logger, newErrorRef } from "@/lib/logger";
import { faNum } from "@/lib/format";
import { auditLog, recordAudit } from "@/lib/audit";
import { retryAfterSeconds, type RateLimitResult } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/actor";

/** The two responses no route spells by hand: an unexpected failure and a 429. */

/**
 * A 500: the error, its stack and a short reference id go to the log; the
 * caller gets a calm Persian message and the same id to quote.
 */
export function serverError(
  where: string,
  err: unknown,
  fields: Record<string, unknown> = {},
): NextResponse {
  const ref = newErrorRef();
  logger.error(`${where} failed`, {
    ref,
    ...fields,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return NextResponse.json(
    {
      error: "خطای غیرمنتظره‌ای رخ داد. اگر تکرار شد، این کد را به پشتیبانی بدهید.",
      ref,
    },
    { status: 500 },
  );
}

/**
 * A 429 with `Retry-After` and a Persian wait time. The request that first
 * crosses a limit writes one durable `rate_limit_hit` row; the rest go to the
 * in-memory log only, so a burst cannot flood the audit table.
 */
export function rateLimited(
  rl: RateLimitResult,
  ctx: {
    endpoint: string;
    ip: string;
    actor?: Actor | null;
    /** Which dimension refused a credential attempt — see lib/rate-limit. */
    limitedBy?: "account" | "address" | null;
  },
): NextResponse {
  const retryAfter = retryAfterSeconds(rl);
  const mins = Math.ceil(retryAfter / 60);
  const wait = mins > 1
    ? `حدود ${faNum(mins)} دقیقه دیگر`
    : "یک دقیقه دیگر";

  // "This account is paused" and "this network is busy" ask different things of
  // the reader. Neither says whether the account exists: the first follows
  // attempts on an identifier whether or not it is registered.
  const message =
    ctx.limitedBy === "account"
      ? `به‌دلیل تلاش‌های ناموفق پیاپی، ورود با این حساب موقتاً بسته شده است. لطفاً ${wait} دوباره تلاش کنید.`
      : `درخواست‌های زیادی فرستاده شده. لطفاً ${wait} دوباره تلاش کنید.`;

  const details = {
    endpoint: ctx.endpoint,
    retryAfter,
    lockedUntil: rl.lockedUntil ?? null,
    ...(ctx.limitedBy ? { limitedBy: ctx.limitedBy } : {}),
  };

  if (rl.justLocked) {
    void recordAudit("rate_limit_hit", { actor: ctx.actor, ip: ctx.ip, severity: "warn", details });
  } else {
    auditLog("rate_limit_hit", "warn", { ip: ctx.ip, details });
  }

  return NextResponse.json(
    { error: message, retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
