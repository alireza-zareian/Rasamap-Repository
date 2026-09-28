import "server-only";
import { prisma } from "./client";
import { isUniqueViolation } from "@/lib/domain/errors";

/**
 * Opt-in Idempotency-Key for non-idempotent POSTs, scoped to a customer
 * account. `raw` is the header, or null.
 *
 * The key is claimed before the work runs — an INSERT of a pending row
 * (statusCode 0) that the primary key lets exactly one request win — so two
 * requests with one key cannot both run.
 *
 * - No header           → `{ claim: null }`; the route runs normally.
 * - Header, won         → `{ claim }`; the route runs, then `claim.save()` on
 *                         success or `claim.release()` on failure, so a failed
 *                         attempt can be retried with the same key.
 * - Header, finished    → `{ replay }`, the stored response.
 * - Header, in flight   → `{ error, status: 409 }`.
 * - Other user/endpoint → `{ error, status: 409 }`.
 *
 * A pending row older than PENDING_TIMEOUT_MS belongs to a request that died,
 * and is claimed afresh. Finished rows are pruned after RETENTION_MS, on each
 * save; a key only has to absorb a double click or a retry.
 */

const KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;
const RETENTION_MS = 24 * 60 * 60 * 1000;
/** Longer than the client's upload timeout (TIMEOUT_MS.upload, 90 s). */
const PENDING_TIMEOUT_MS = 2 * 60 * 1000;
const PENDING = 0;

export interface IdempotencyClaim {
  save(status: number, body: unknown): Promise<void>;
  release(): Promise<void>;
}

type Result =
  | { error: string; status: 409 }
  | { replay: { status: number; body: unknown } }
  | { claim: IdempotencyClaim | null };

async function tryClaim(key: string, userId: number, endpoint: string): Promise<boolean> {
  try {
    await prisma.idempotencyKey.create({ data: { key, userId, endpoint, statusCode: PENDING, response: {} } });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

export async function idempotency(raw: string | null, userId: number, endpoint: string): Promise<Result> {
  if (!raw) return { claim: null };
  if (!KEY_RE.test(raw)) {
    return { error: "Idempotency-Key نامعتبر است (۸ تا ۱۲۸ نویسه: حروف، عدد، خط تیره)", status: 409 };
  }

  let won = await tryClaim(raw, userId, endpoint);
  if (!won) {
    const existing = await prisma.idempotencyKey.findUnique({ where: { key: raw } });
    if (existing && (existing.userId !== userId || existing.endpoint !== endpoint)) {
      return { error: "این Idempotency-Key قبلاً برای درخواست دیگری استفاده شده است", status: 409 };
    }
    if (existing && existing.statusCode !== PENDING) {
      return { replay: { status: existing.statusCode, body: existing.response } };
    }
    const abandoned = !existing || existing.createdAt.getTime() < Date.now() - PENDING_TIMEOUT_MS;
    if (!abandoned) return { error: "درخواست قبلی شما هنوز در حال انجام است. چند لحظه صبر کنید.", status: 409 };
    // Only the request that removes the stale row may take it over.
    const { count } = await prisma.idempotencyKey.deleteMany({ where: { key: raw, statusCode: PENDING } });
    won = count > 0 || !existing ? await tryClaim(raw, userId, endpoint) : false;
    if (!won) return { error: "درخواست قبلی شما هنوز در حال انجام است. چند لحظه صبر کنید.", status: 409 };
  }

  return {
    claim: {
      async save(status, body) {
        await prisma.idempotencyKey.update({ where: { key: raw }, data: { statusCode: status, response: body as object } });
        try {
          await prisma.idempotencyKey.deleteMany({
            where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) }, NOT: { statusCode: PENDING } },
          });
        } catch {
          // Housekeeping; the write that mattered already succeeded.
        }
      },
      async release() {
        await prisma.idempotencyKey.deleteMany({ where: { key: raw, statusCode: PENDING } });
      },
    },
  };
}
