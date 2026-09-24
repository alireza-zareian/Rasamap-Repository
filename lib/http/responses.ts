import "server-only";
import { NextResponse } from "next/server";
import { logger, newErrorRef } from "@/lib/logger";
import { faNum } from "@/lib/format";
import { auditLog, recordAudit } from "@/lib/audit";
import { retryAfterSeconds, type RateLimitResult } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/actor";

/**
 * The two responses every route may need and none may spell by hand: an
 * unexpected failure, and a refusal for going too fast. One definition each is
 * what keeps their wording, headers and logging from drifting apart — four
 * hand-rolled 429s once disagreed about the limit they reported.
 */

/**
 * A 500 that is still useful: the real error (with its stack and a short
 * reference id) goes to the log, and the caller gets a calm Persian message
 * plus the same id to quote. Internals never reach the response body (§5).
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
 * A failed rate-limit check, as a 429 with `Retry-After` and a Persian message
 * that says how long to wait. The request that first crosses a limit writes one
 * durable `rate_limit_hit` row; the repeated 429s after it are only counted in
 * the in-memory log, so a burst cannot flood the audit table.
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

  // Two refusals that feel the same to the server are very different to the
  // person reading them: "this account is paused" tells them to stop retyping
  // the password, while "this network is busy" tells them it is not about them
  // at all. Saying "too many requests" for both left people guessing.
  //
  // Neither wording says whether the account exists. The account message is
  // reached only after attempts were made against that identifier, which the
  // caller already knows — it reveals nothing a failed sign-in did not.
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
